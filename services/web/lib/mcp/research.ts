/**
 * Symbol research bundle for the MCP `get_symbol_research` tool. Reads the DB
 * directly via the shared read queries (`@qt/shared/research`) — the same data the
 * dashboard shows — then COMPACTS each section for an LLM consumer (drop the heavy
 * internals: per-model assumptions, valuation pillars, 400-bar history, raw news
 * bodies). Each section is best-effort: a failure is reported in `errors`, not
 * fatal. Moved from services/data so the MCP endpoint lives on web (the sole public
 * ingress); web reads the read-only DB just like every dashboard page.
 */
import { db } from "@/lib/db";
import { getLatestValuation, getFinancials, getPrices, getAnalystsData, getSymbolNews } from "@qt/shared/research";
import { getOwnershipForSymbol } from "@qt/shared/ownership-read";
import { get8KForSymbol } from "@qt/shared/edgar-8k-read";
import { getInsidersForSymbol } from "@qt/shared/form4-read";

export const RESEARCH_SECTIONS = ["valuation", "financials", "chart", "news", "analysts", "ownership", "events"] as const;
export type ResearchSection = (typeof RESEARCH_SECTIONS)[number];

// ---- compaction helpers ----

type Row = Record<string, unknown>;
const asRow = (x: unknown): Row => (x && typeof x === "object" ? (x as Row) : {});

/** Copy only the present (non-null) keys from a raw jsonb object. */
function pick(src: unknown, keys: readonly string[]): Row {
  const o = asRow(src);
  const out: Row = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
  return out;
}

const INCOME_FIELDS = ["fiscalYear", "revenue", "grossProfit", "operatingIncome", "ebitda", "netIncome", "eps", "epsDiluted"];
const BALANCE_FIELDS = ["fiscalYear", "totalAssets", "totalLiabilities", "totalEquity", "cashAndCashEquivalents", "totalDebt", "netDebt"];
const CASHFLOW_FIELDS = ["fiscalYear", "operatingCashFlow", "capitalExpenditure", "freeCashFlow", "netDividendsPaid", "stockBasedCompensation"];
const RATIO_FIELDS = ["fiscalYear", "priceToEarningsRatio", "priceToSalesRatio", "priceToBookRatio", "grossProfitMargin", "operatingProfitMargin", "netProfitMargin", "debtToEquityRatio", "currentRatio", "freeCashFlowPerShare", "dividendYield"];
const ESTIMATE_FIELDS = ["revenueAvg", "ebitdaAvg", "netIncomeAvg", "epsAvg", "numAnalystsRevenue", "numAnalystsEps"];
const RATING_FIELDS = ["gradingCompany", "previousGrade", "newGrade", "action"];
const PT_FIELDS = ["priceTarget", "adjPriceTarget", "analystName", "analystCompany", "publishedDate", "priceWhenPosted"];
const NEWS_FIELDS = ["title", "site", "url", "symbol", "category", "publishedAt"];

type Dated = { fiscalDate: string | null; data: unknown };
const rows = (xs: Dated[] | undefined, fields: readonly string[], n: number) =>
  (xs ?? []).slice(-n).map((r) => ({ fiscalDate: r.fiscalDate, ...pick(r.data, fields) }));

function compactValuation(v: Awaited<ReturnType<typeof getLatestValuation>>) {
  if (!v) return null;
  const d = asRow(v.detail);
  const cls = asRow(d.classification);
  const models = Array.isArray(d.models)
    ? d.models.map((m) => {
        const r = asRow(m);
        return { model: r.model_type, fairValue: r.fair_value, upsidePct: r.upside_percent };
      })
    : [];
  return {
    symbol: v.symbol,
    asOf: v.asOf,
    currentPrice: v.currentPrice,
    fairValuePerShare: v.fairValuePerShare,
    upsidePct: v.upsidePct,
    verdict: v.verdict,
    archetype: cls.label,
    archetypeTraits: cls.traits,
    wacc: d.wacc,
    consensus: { fairValue: d.consensus_fair_value, low: d.consensus_low, high: d.consensus_high, upsidePct: d.consensus_upside },
    models,
  };
}

function compactFinancials(f: Awaited<ReturnType<typeof getFinancials>>) {
  return {
    symbol: f.symbol,
    period: f.period,
    income: rows(f.income, INCOME_FIELDS, 4),
    balance: rows(f.balance, BALANCE_FIELDS, 4),
    cashflow: rows(f.cashflow, CASHFLOW_FIELDS, 4),
    ratios: rows(f.ratios, RATIO_FIELDS, 4),
    estimates: rows(f.estimates, ESTIMATE_FIELDS, 6),
  };
}

function compactAnalysts(a: Awaited<ReturnType<typeof getAnalystsData>>) {
  const obs = (xs: { observedAt: Date | null; data: unknown }[] | undefined, fields: readonly string[], n: number) =>
    (xs ?? []).slice(0, n).map((r) => ({ observedAt: r.observedAt, ...pick(r.data, fields) }));
  return {
    symbol: a.symbol,
    ratings: obs(a.ratings, RATING_FIELDS, 20),
    priceTargets: obs(a.priceTargets, PT_FIELDS, 25),
    // insider moved to the ownership section (SEC Form 4, richer)
  };
}

const compactNews = (xs: Row[]) => xs.slice(0, 15).map((r) => pick(r, NEWS_FIELDS));

/** SEC ownership: 13D/13G beneficial-ownership filings (>5%) + tracked 13F legend
 *  holders + insider transactions (SEC Form 4, rich: code + 10b5-1). 13D/13G pct/shares
 *  are best-effort; only rostered filers' 13D/13G. insiderSource is "sec" or "none". */
function compactOwnership(
  o: Awaited<ReturnType<typeof getOwnershipForSymbol>>,
  ins: Awaited<ReturnType<typeof getInsidersForSymbol>>,
) {
  return {
    symbol: o.symbol,
    filings: o.filings.map((f) => ({
      schedule: f.schedule, // "13D" activist | "13G" passive
      filer: f.filerLabel ?? f.filerName,
      pctOfClass: f.pctOfClass,
      sharesOwned: f.sharesOwned,
      filedDate: f.filedDate,
      amendments: f.amendmentCount - 1,
      firstFiledDate: f.firstFiledDate,
    })),
    legendHolders: o.legendHolders.map((h) => ({ filer: h.filerLabel ?? h.filerName, shares: h.shares, value: h.value, quarter: h.quarter })),
    insiderSource: ins.source, // "sec" | "none"
    insiders: ins.insiders.slice(0, 25).map((t) => ({
      filer: t.reportingName,
      role: t.officerTitle ?? t.relationship,
      code: t.code, // P buy / S sell / M exercise / F tax / A grant / G gift …
      action: t.codeLabel,
      signal: t.signal,
      shares: t.shares,
      price: t.price,
      value: t.value,
      is10b5_1: t.is10b5_1,
      date: t.date,
    })),
  };
}

/** SEC 8-K material events: official current-report filings with decoded item codes
 *  (2.02 earnings, 5.02 leadership, 1.03 bankruptcy, …) + materiality category. */
function compactEvents(o: Awaited<ReturnType<typeof get8KForSymbol>>) {
  return {
    symbol: o.symbol,
    events: o.events.map((e) => ({
      filedDate: e.filedDate,
      reportDate: e.reportDate,
      category: e.category, // "high" | "material" | "routine"
      items: e.items.map((i) => `${i.code} ${i.label}`),
    })),
  };
}

// ---- bundle ----

async function fetchSection(section: ResearchSection, sym: string): Promise<unknown> {
  const d = db();
  switch (section) {
    case "valuation":
      return compactValuation(await getLatestValuation(d, sym));
    case "financials":
      return compactFinancials(await getFinancials(d, sym, { period: "annual", limit: 4 }));
    case "chart":
      return getPrices(d, sym, { days: 90 }); // ~1 quarter of bars + fair-value overlay
    case "analysts":
      return compactAnalysts(await getAnalystsData(d, sym));
    case "news":
      return compactNews(await getSymbolNews(d, sym, 15));
    case "ownership": {
      const [own, ins] = await Promise.all([getOwnershipForSymbol(d, sym), getInsidersForSymbol(d, sym)]);
      return compactOwnership(own, ins);
    }
    case "events":
      return compactEvents(await get8KForSymbol(d, sym));
  }
}

export interface SymbolResearch {
  symbol: string;
  sections: Record<string, unknown>;
  errors?: Record<string, string>;
}

/** Fetch a symbol's compact research bundle. `sections` defaults to all (deduped). */
export async function getSymbolResearch(symbol: string, sections?: ResearchSection[]): Promise<SymbolResearch> {
  const sym = symbol.trim().toUpperCase();
  const wanted = Array.from(new Set(sections?.length ? sections : RESEARCH_SECTIONS));

  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    wanted.map(async (s) => {
      try {
        out[s] = await fetchSection(s, sym);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors[s] = msg;
        console.warn("mcp.fetch_section_failed", { symbol: sym, section: s, error: msg });
      }
    }),
  );

  return { symbol: sym, sections: out, ...(Object.keys(errors).length ? { errors } : {}) };
}
