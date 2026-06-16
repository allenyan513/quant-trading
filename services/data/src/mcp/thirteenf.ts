/**
 * 13F export for the MCP tools: list tracked legendary investors, and one
 * investor's holdings + this-quarter buys/sells. Reads via the shared 13F queries
 * (`@qt/shared/thirteenf-read`, same data the dashboard shows) and shapes a
 * compact, LLM-friendly JSON. Read-only; 13F is public SEC data (~45-day lag,
 * quarterly). The pure transforms (split/summarize/shape) are exported for tests.
 */
import { db } from "@qt/shared";
import { list13fFilers, list13fHoldings, resolveFiler, type FilerSummary, type HoldingRow } from "@qt/shared/thirteenf-read";

export const THIRTEENF_SECTIONS = ["summary", "holdings", "buys", "sells"] as const;
export type ThirteenFSection = (typeof THIRTEENF_SECTIONS)[number];

const NOTE =
  "13F filings are public SEC data, filed ~45 days after quarter end — a quarterly snapshot, NOT live " +
  "holdings. 'pctPortfolio' = % of total reported 13F value (includes any put/call options). " +
  "'reportedPrice' = value/shares (avg price implied by the filing, not the current quote). " +
  "'changePct' is the share change vs the prior quarter, in %.";

const today = (): string => new Date().toISOString().slice(0, 10);
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** "2026-03-31" → "Q1 2026". */
export function quarterLabel(q: string | null): string | null {
  if (!q) return null;
  const [y, m] = q.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return `Q${Math.ceil(m / 3)} ${y}`;
}

/** Share change vs prior quarter, %. new→null (no prior), exited→-100, held→0. */
export function changePct(h: HoldingRow): number | null {
  if (h.change === "new") return null;
  if (h.change === "exited") return -100;
  if (h.prevShares <= 0) return null;
  return r2(((h.shares - h.prevShares) / h.prevShares) * 100);
}

function shapeHolding(h: HoldingRow) {
  return {
    ticker: h.ticker,
    issuer: h.issuerName,
    cusip: h.cusip,
    putCall: h.putCall || undefined,
    pctPortfolio: r2(h.pctPortfolio * 100),
    shares: h.shares,
    reportedPrice: h.reportedPrice != null ? r2(h.reportedPrice) : null,
    value: h.value,
    change: h.change,
    changePct: changePct(h),
    prevShares: h.prevShares,
  };
}

/** Split a filer's diffed holdings into current positions, buys (new+added), sells (trimmed+exited). */
export function splitActivity(holdings: HoldingRow[]) {
  return {
    current: holdings.filter((h) => h.change !== "exited"),
    buys: holdings.filter((h) => h.change === "new" || h.change === "added"),
    sells: holdings.filter((h) => h.change === "trimmed" || h.change === "exited"),
  };
}

/** Per-change counts + current position count/value. positions = new+added+held+trimmed. */
export function summarize(holdings: HoldingRow[]) {
  const current = holdings.filter((h) => h.change !== "exited");
  const cnt = (c: string): number => holdings.filter((h) => h.change === c).length;
  return {
    positions: current.length,
    portfolioValue: current.reduce((s, h) => s + h.value, 0),
    newCount: cnt("new"),
    addedCount: cnt("added"),
    heldCount: cnt("held"),
    trimmedCount: cnt("trimmed"),
    exitedCount: cnt("exited"),
  };
}

// ───────────────────────── tool 1: list investors ─────────────────────────

export interface InvestorsListOpts {
  sort?: "recent" | "value" | "name";
  limit?: number;
}

export async function getInvestorsList(opts: InvestorsListOpts = {}) {
  const filers = await list13fFilers(db());
  let sorted: FilerSummary[] = filers; // default 'recent' = filers' own order (filedAt desc)
  if (opts.sort === "value") sorted = [...filers].sort((a, b) => b.totalValue - a.totalValue);
  else if (opts.sort === "name") sorted = [...filers].sort((a, b) => a.name.localeCompare(b.name));
  const limited = opts.limit && opts.limit > 0 ? sorted.slice(0, opts.limit) : sorted;
  return {
    asOf: today(),
    note: NOTE,
    count: limited.length,
    investors: limited.map((f) => ({
      cik: f.cik,
      name: f.name,
      label: f.label,
      quarter: f.latestQuarter,
      quarterLabel: quarterLabel(f.latestQuarter),
      filedAt: f.filedAt,
      positions: f.positions,
      portfolioValue: f.totalValue,
    })),
  };
}

// ───────────────────────── tool 2: one investor's holdings + buys/sells ─────────────────────────

export interface InvestorDetailOpts {
  topN?: number;
  sections?: ThirteenFSection[];
}

export async function getInvestorDetail(query: string, opts: InvestorDetailOpts = {}) {
  const resolved = await resolveFiler(db(), query);
  if (!resolved.ok) {
    if (resolved.reason === "ambiguous") {
      return {
        error: "ambiguous_investor",
        message: `"${query}" matches multiple tracked investors — pass a CIK or a more specific name.`,
        candidates: resolved.candidates.map((c) => ({ cik: c.cik, name: c.name, label: c.label })),
      };
    }
    return {
      error: "investor_not_found",
      message: `No tracked investor matches "${query}". Call list_13f_investors to see the roster.`,
    };
  }

  const { cik, name, label } = resolved.filer;
  const fh = await list13fHoldings(db(), cik);
  const want = opts.sections?.length ? new Set<ThirteenFSection>(opts.sections) : new Set<ThirteenFSection>(THIRTEENF_SECTIONS);
  const topN = opts.topN && opts.topN > 0 ? opts.topN : 50;
  const { current, buys, sells } = splitActivity(fh.holdings);

  const out: Record<string, unknown> = {
    investor: { cik, name, label },
    quarter: fh.quarter,
    quarterLabel: quarterLabel(fh.quarter),
    prevQuarter: fh.prevQuarter,
    asOf: fh.filedAt,
    note: NOTE,
  };
  if (want.has("summary")) out.summary = summarize(fh.holdings);
  if (want.has("holdings")) {
    out.holdings = current.slice(0, topN).map(shapeHolding);
    out.holdingsTotal = current.length;
    out.holdingsTruncated = current.length > topN;
  }
  if (want.has("buys")) out.buys = buys.map(shapeHolding);
  if (want.has("sells")) out.sells = sells.map(shapeHolding);
  return out;
}
