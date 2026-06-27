/**
 * 13F read queries — shared by the SPA dashboard and data's MCP endpoint so both
 * serve identical shapes from one source (mirrors research.ts). The Drizzle db is
 * injected (gateway = neon-http, data = pg Pool; both PgDatabase), so the builders
 * here are driver-agnostic. All read-only.
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { thirteenFFilers, thirteenFHoldings, thirteenFCusipMap } from "./db/schema.js";
import { diffHoldings, padCik, type Holding13F, type HoldingChange } from "./thirteenf.js";

// Either driver's db is a PgDatabase; the `.select()...` builders are identical.
export type ReadDb = PgDatabase<any, any, any>;

// ───────────────────────── list (discovery) ─────────────────────────

export interface FilerSummary {
  cik: string;
  name: string;
  label: string | null;
  latestQuarter: string | null;
  /** Most recent 13F filing/acceptance date (known_at), `YYYY-MM-DD`. Sort key. */
  filedAt: string | null;
  positions: number;
  totalValue: number;
}

/** Tracked managers + a snapshot of their latest filed quarter, newest 13F filing
 *  first (ties by size). Filers with no holdings yet sort last with nulls/zeros. */
export async function list13fFilers(db: ReadDb): Promise<FilerSummary[]> {
  const [filers, groups] = await Promise.all([
    db
      .select({ cik: thirteenFFilers.cik, name: thirteenFFilers.name, label: thirteenFFilers.label })
      .from(thirteenFFilers)
      .where(eq(thirteenFFilers.active, true)),
    db
      .select({
        cik: thirteenFHoldings.cik,
        quarter: thirteenFHoldings.quarter,
        positions: count(),
        totalValue: sql<number>`sum(${thirteenFHoldings.value})`,
        filedAt: sql<string>`max(${thirteenFHoldings.knownAt})::date::text`,
      })
      .from(thirteenFHoldings)
      .groupBy(thirteenFHoldings.cik, thirteenFHoldings.quarter),
  ]);
  const latest = new Map<string, { quarter: string; positions: number; totalValue: number }>();
  const filedAt = new Map<string, string>();
  for (const g of groups) {
    const cur = latest.get(g.cik);
    if (!cur || g.quarter > cur.quarter) {
      latest.set(g.cik, { quarter: g.quarter, positions: Number(g.positions), totalValue: Number(g.totalValue) });
    }
    const f = filedAt.get(g.cik);
    if (g.filedAt && (!f || g.filedAt > f)) filedAt.set(g.cik, g.filedAt);
  }
  return filers
    .map((f) => {
      const l = latest.get(f.cik);
      return {
        cik: f.cik,
        name: f.name,
        label: f.label,
        latestQuarter: l?.quarter ?? null,
        filedAt: filedAt.get(f.cik) ?? null,
        positions: l?.positions ?? 0,
        totalValue: l?.totalValue ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.filedAt !== b.filedAt) {
        if (!a.filedAt) return 1;
        if (!b.filedAt) return -1;
        return b.filedAt.localeCompare(a.filedAt);
      }
      return b.totalValue - a.totalValue;
    });
}

// ───────────────────────── header (light) ─────────────────────────

export interface FilerHeader {
  cik: string;
  name: string | null;
  /** Latest filed quarter end (YYYY-MM-DD); null when nothing synced yet. */
  quarter: string | null;
  stockCount: number;
  portfolioValue: number;
}

/** Lightweight latest-quarter header (Period / # stocks / value), no per-holding rows. */
export async function get13fFilerHeader(db: ReadDb, cikRaw: string): Promise<FilerHeader> {
  const cik = cikRaw.replace(/\D/g, "").padStart(10, "0");
  const [filer] = await db
    .select({ name: thirteenFFilers.name })
    .from(thirteenFFilers)
    .where(eq(thirteenFFilers.cik, cik));
  const [top] = await db
    .select({
      quarter: thirteenFHoldings.quarter,
      positions: count(),
      totalValue: sql<number>`sum(${thirteenFHoldings.value})`,
    })
    .from(thirteenFHoldings)
    .where(eq(thirteenFHoldings.cik, cik))
    .groupBy(thirteenFHoldings.quarter)
    .orderBy(desc(thirteenFHoldings.quarter))
    .limit(1);
  return {
    cik,
    name: filer?.name ?? null,
    quarter: top?.quarter ?? null,
    stockCount: top ? Number(top.positions) : 0,
    portfolioValue: top ? Number(top.totalValue) : 0,
  };
}

// ───────────────────────── detail (holdings + QoQ change) ─────────────────────────

export interface HoldingRow {
  cusip: string;
  ticker: string | null;
  issuerName: string;
  titleOfClass: string | null;
  putCall: string;
  value: number;
  shares: number;
  prevShares: number;
  change: HoldingChange;
  /** value / current-quarter total value — share of the reported portfolio (0..1). */
  pctPortfolio: number;
  /** value / shares — the avg price implied by the 13F filing. Null when shares=0. */
  reportedPrice: number | null;
}

export interface FilerHoldings {
  cik: string;
  name: string | null;
  quarter: string | null;
  prevQuarter: string | null;
  /** Filing/acceptance date of the latest quarter (known_at), `YYYY-MM-DD`. */
  filedAt: string | null;
  holdings: HoldingRow[];
}

/** One manager's latest-quarter holdings, each tagged with its quarter-over-quarter
 *  change (new/added/trimmed/held + exited names from the prior quarter). Tickers
 *  resolved via the self-maintained CUSIP map (null when unmapped/tombstoned). */
export async function list13fHoldings(db: ReadDb, cikRaw: string): Promise<FilerHoldings> {
  const cik = cikRaw.replace(/\D/g, "").padStart(10, "0");
  const [filer] = await db
    .select({ name: thirteenFFilers.name })
    .from(thirteenFFilers)
    .where(eq(thirteenFFilers.cik, cik));
  const quarters = await db
    .select({
      quarter: thirteenFHoldings.quarter,
      filedAt: sql<string>`max(${thirteenFHoldings.knownAt})::date::text`,
    })
    .from(thirteenFHoldings)
    .where(eq(thirteenFHoldings.cik, cik))
    .groupBy(thirteenFHoldings.quarter)
    .orderBy(desc(thirteenFHoldings.quarter))
    .limit(2);
  if (quarters.length === 0) {
    return { cik, name: filer?.name ?? null, quarter: null, prevQuarter: null, filedAt: null, holdings: [] };
  }
  const currQ = quarters[0]!.quarter;
  const prevQ = quarters[1]?.quarter ?? null;
  const filedAt = quarters[0]!.filedAt ?? null;

  const rowsFor = async (q: string): Promise<Holding13F[]> => {
    const rows = await db
      .select()
      .from(thirteenFHoldings)
      .where(and(eq(thirteenFHoldings.cik, cik), eq(thirteenFHoldings.quarter, q)));
    return rows.map((r) => ({
      cusip: r.cusip,
      issuerName: r.issuerName,
      titleOfClass: r.titleOfClass ?? "",
      value: r.value,
      shares: r.shares,
      putCall: r.putCall,
    }));
  };

  const [curr, prev] = await Promise.all([rowsFor(currQ), prevQ ? rowsFor(prevQ) : Promise.resolve([])]);
  const deltas = diffHoldings(curr, prev);
  const totalValue = curr.reduce((s, h) => s + h.value, 0);

  const titleByKey = new Map(curr.map((h) => [`${h.cusip}|${h.putCall}`, h.titleOfClass]));
  const cusips = [...new Set(deltas.map((d) => d.cusip))];
  const tickerByCusip = new Map<string, string>();
  if (cusips.length) {
    const maps = await db
      .select({ cusip: thirteenFCusipMap.cusip, ticker: thirteenFCusipMap.ticker })
      .from(thirteenFCusipMap)
      .where(inArray(thirteenFCusipMap.cusip, cusips));
    for (const m of maps) if (m.ticker) tickerByCusip.set(m.cusip, m.ticker); // skip null tombstones
  }

  const holdings: HoldingRow[] = deltas
    .map((d) => ({
      cusip: d.cusip,
      ticker: tickerByCusip.get(d.cusip) ?? null,
      issuerName: d.issuerName,
      titleOfClass: titleByKey.get(`${d.cusip}|${d.putCall}`) || null,
      putCall: d.putCall,
      value: d.value,
      shares: d.shares,
      prevShares: d.prevShares,
      change: d.change,
      pctPortfolio: totalValue > 0 ? d.value / totalValue : 0,
      reportedPrice: d.shares > 0 ? d.value / d.shares : null,
    }))
    .sort((a, b) => b.value - a.value);

  return { cik, name: filer?.name ?? null, quarter: currQ, prevQuarter: prevQ, filedAt, holdings };
}

// ───────────────────────── investor resolution (CIK or name/label) ─────────────────────────

export interface FilerRef {
  cik: string;
  name: string;
  label: string | null;
}

export type ResolveResult =
  | { ok: true; filer: FilerRef }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ambiguous"; candidates: FilerRef[] };

/**
 * Pure: resolve a query to one tracked filer. All-digits → CIK (zero-padded).
 * Otherwise case-insensitive substring on label/name; a single hit wins, an exact
 * label/name match breaks ties, else `ambiguous` with the candidate list.
 */
export function matchFiler(filers: FilerRef[], query: string): ResolveResult {
  const q = query.trim();
  if (/^\d{4,10}$/.test(q)) {
    const cik = padCik(Number(q));
    const f = filers.find((x) => x.cik === cik);
    return f ? { ok: true, filer: f } : { ok: false, reason: "not_found" };
  }
  const ql = q.toLowerCase();
  const hits = filers.filter((f) => f.name.toLowerCase().includes(ql) || (f.label?.toLowerCase().includes(ql) ?? false));
  if (hits.length === 0) return { ok: false, reason: "not_found" };
  if (hits.length === 1) return { ok: true, filer: hits[0]! };
  const exact = hits.filter((f) => f.name.toLowerCase() === ql || f.label?.toLowerCase() === ql);
  if (exact.length === 1) return { ok: true, filer: exact[0]! };
  return { ok: false, reason: "ambiguous", candidates: hits };
}

/** Resolve a CIK-or-name query against the active roster (DB read + matchFiler). */
export async function resolveFiler(db: ReadDb, query: string): Promise<ResolveResult> {
  const filers = await db
    .select({ cik: thirteenFFilers.cik, name: thirteenFFilers.name, label: thirteenFFilers.label })
    .from(thirteenFFilers)
    .where(eq(thirteenFFilers.active, true));
  return matchFiler(filers, query);
}

// ───────────────────────── pure transforms (MCP export shaping; unit-tested) ─────────────────────────

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

/** Split diffed holdings into current positions, buys (new+added), sells (trimmed+exited). */
export function splitActivity(holdings: HoldingRow[]): { current: HoldingRow[]; buys: HoldingRow[]; sells: HoldingRow[] } {
  return {
    current: holdings.filter((h) => h.change !== "exited"),
    buys: holdings.filter((h) => h.change === "new" || h.change === "added"),
    sells: holdings.filter((h) => h.change === "trimmed" || h.change === "exited"),
  };
}

/** Per-change counts + current position count/value. positions = new+added+held+trimmed. */
export function summarize(holdings: HoldingRow[]): {
  positions: number;
  portfolioValue: number;
  newCount: number;
  addedCount: number;
  heldCount: number;
  trimmedCount: number;
  exitedCount: number;
} {
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
