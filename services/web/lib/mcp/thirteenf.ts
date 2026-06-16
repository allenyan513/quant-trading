/**
 * 13F export for the MCP tools: list tracked legendary investors, and one
 * investor's holdings + this-quarter buys/sells. Reads via the shared 13F queries
 * (`@qt/shared/thirteenf-read`) and shapes compact, LLM-friendly JSON. Read-only.
 * Pure transforms (split/summarize/changePct/quarterLabel) live in the shared
 * module (unit-tested there); this file does the DB read + response assembly.
 */
import { db } from "@/lib/db";
import {
  list13fFilers,
  list13fHoldings,
  resolveFiler,
  changePct,
  splitActivity,
  summarize,
  quarterLabel,
  type FilerSummary,
  type HoldingRow,
} from "@qt/shared/thirteenf-read";

export const THIRTEENF_SECTIONS = ["summary", "holdings", "buys", "sells"] as const;
export type ThirteenFSection = (typeof THIRTEENF_SECTIONS)[number];

const NOTE =
  "13F filings are public SEC data, filed ~45 days after quarter end — a quarterly snapshot, NOT live " +
  "holdings. 'pctPortfolio' = % of total reported 13F value (includes any put/call options). " +
  "'reportedPrice' = value/shares (avg price implied by the filing, not the current quote). " +
  "'changePct' is the share change vs the prior quarter, in %.";

const today = (): string => new Date().toISOString().slice(0, 10);
const r2 = (n: number): number => Math.round(n * 100) / 100;

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
