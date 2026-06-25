/**
 * Read-through market-data cache — System A's data layer.
 *
 * alpha asks for fundamentals / prices; we serve from the PIT tables when
 * they're fresh, else fetch from FMP, persist (known_at = acceptedDate, rows are
 * immutable so onConflictDoNothing), and return. This keeps data a pure
 * event pipeline while still landing reusable, replayable PIT data — and avoids
 * re-hitting FMP (rate limits / latency) on every signal.
 *
 * Staleness is heuristic (no extra bookkeeping table): statements change
 * quarterly, prices daily — so "do we already have a recent-enough row?" is
 * answered straight from the data. TTL/sidecar refinement is future work.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { fmpGet } from "../fmp.js";
import { fetchStatements } from "../edgar.js";
import { mapLimit } from "../concurrency.js";
import { createLogger } from "../log.js";

const log = createLogger("marketdata");

/** Max peer `ratios` requests in flight at once (caps fan-out; fmpGet still throttles globally). */
const PEER_FETCH_CONCURRENCY = 10;

export type StatementPeriod = "annual" | "quarter";

// ───────────────────────── pure helpers (unit-tested) ─────────────────────────

/**
 * FMP `acceptedDate` is a naive US-Eastern wall-clock ("YYYY-MM-DD HH:MM:SS").
 * Convert to a real UTC Date so known_at is timezone-correct (DST-aware via a
 * two-pass Intl offset computation). Falls back to parsing as-is if unmatched.
 */
export function easternToUtc(naive: string): Date {
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(naive);
  const [, y, mo, d, h, mi, s] = m;
  const wallUtc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(s ?? 0));
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(wallUtc))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? "00" : parts.hour!;
  const etWall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +hour, +parts.minute!, +parts.second!);
  return new Date(wallUtc + (wallUtc - etWall));
}

const STATEMENT_STALE_DAYS: Record<StatementPeriod, number> = { quarter: 100, annual: 380 };
const PRICE_STALE_DAYS = 4; // tolerate a weekend + holiday gap

const daysBetween = (fromISO: string, now: Date): number =>
  (now.getTime() - Date.parse(fromISO)) / 86_400_000;

/** Fresh if the newest stored fiscal period is recent enough that a newer filing is unlikely. */
export function isStatementFresh(latestFiscalDate: string | null, period: StatementPeriod, now: Date): boolean {
  if (!latestFiscalDate) return false;
  return daysBetween(latestFiscalDate, now) <= STATEMENT_STALE_DAYS[period];
}

/** Fresh if we already have a row for (about) the latest trading day. */
export function isPriceFresh(latestTradeDate: string | null, now: Date): boolean {
  if (!latestTradeDate) return false;
  return daysBetween(latestTradeDate, now) <= PRICE_STALE_DAYS;
}

interface FmpStatement {
  date?: string; // fiscal period end (YYYY-MM-DD)
  acceptedDate?: string; // filing timestamp (naive ET)
  [k: string]: unknown;
}

export interface StatementRowInput {
  symbol: string;
  period: StatementPeriod;
  fiscalDate: string;
  knownAt: Date;
  data: Record<string, unknown>;
}

/**
 * known_at = acceptedDate (PIT). Guards against a malformed/empty acceptedDate
 * yielding an Invalid Date (which would crash the timestamp insert): fall back
 * to the fiscal date (midnight UTC) when the parse fails.
 */
export function knownAtFrom(acceptedDate: string | undefined, fiscalDate: string): Date {
  if (acceptedDate) {
    const d = easternToUtc(acceptedDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(`${fiscalDate}T00:00:00Z`);
}

/** Pure: FMP statement rows → PIT table rows. known_at = acceptedDate (PIT). */
export function mapStatementRows(symbol: string, period: StatementPeriod, rows: FmpStatement[]): StatementRowInput[] {
  const out: StatementRowInput[] = [];
  for (const r of rows) {
    if (!r.date) continue; // need a fiscal date (part of the PK)
    out.push({
      symbol,
      period,
      fiscalDate: r.date,
      knownAt: knownAtFrom(r.acceptedDate, r.date),
      data: r as Record<string, unknown>,
    });
  }
  return out;
}

interface FmpPrice {
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  volume?: number | null;
}

export interface PriceRowInput {
  symbol: string;
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
}

/** Pure: FMP EOD price rows → daily_prices rows. */
export function mapPriceRows(symbol: string, rows: FmpPrice[]): PriceRowInput[] {
  const out: PriceRowInput[] = [];
  for (const r of rows) {
    if (!r.date) continue;
    out.push({
      symbol,
      tradeDate: r.date,
      open: r.open ?? null,
      high: r.high ?? null,
      low: r.low ?? null,
      close: r.close ?? null,
      adjClose: r.adjClose ?? null,
      volume: r.volume ?? null,
    });
  }
  return out;
}

// ───────────────────────── cached fetchers (DB + FMP) ─────────────────────────

// All five statement-shaped datasets share one columns layout (see schema's
// statementCols), so one generic impl + thin wrappers. The casts go through
// `unknown` because the tables are structurally identical (same columns) but
// carry distinct table-name literals; treating them uniformly here is safe.
type StatementTable = typeof schema.incomeStatement;
const asStmt = (t: unknown) => t as StatementTable;

const STATEMENT_SOURCES = {
  income: { table: asStmt(schema.incomeStatement), path: "income-statement" },
  balance: { table: asStmt(schema.balanceSheet), path: "balance-sheet-statement" },
  cashflow: { table: asStmt(schema.cashFlow), path: "cash-flow-statement" },
  ratios: { table: asStmt(schema.financialRatios), path: "ratios" },
  estimates: { table: asStmt(schema.analystEstimates), path: "analyst-estimates" },
} as const;
type StatementKind = keyof typeof STATEMENT_SOURCES;

// Always cache a deep window regardless of the caller's `limit`, then slice. This
// decouples cache depth from request size, so a small-`limit` caller (e.g. the
// agent's 4) can never leave a shallow cache that later starves a large-`limit`
// caller (e.g. a 10Y DCF). The cache gate is therefore freshness-only — a fresh
// cache is already as complete as FMP allows. (See #33.)
const STATEMENT_FETCH_LIMIT = 20;

// The three financial statements come from SEC EDGAR (free, official) instead of
// FMP. Quarterly: FMP's free tier gates the endpoints outright. Annual: FMP's
// free tier serves it, but EDGAR's known_at = 10-K filing date is more
// authoritative and its quarterly path already proved the mapper out — so we
// prefer EDGAR for annual too, falling back to FMP only when EDGAR has no filing
// (foreign / ADR tickers aren't EDGAR filers). companyfacts returns all three
// statements in one fetch, so populating any one of income/balance/cashflow
// fills the other two — the freshness gate then short-circuits their refetch.
const EDGAR_STATEMENT_KINDS = { income: true, balance: true, cashflow: true } as const;
type EdgarStatementKind = keyof typeof EDGAR_STATEMENT_KINDS;
const isEdgarKind = (k: StatementKind): k is EdgarStatementKind => k in EDGAR_STATEMENT_KINDS;

const edgarInFlight = new Map<string, Promise<void>>();

/** Fetch SEC EDGAR statements for `period` and persist all three (immutable PIT,
 *  known_at = filing date). Best-effort: any failure logs and is swallowed so
 *  the read-through degrades to whatever cache exists (mirrors FMP soft-fail).
 *  Concurrent calls for the same (symbol, period) collapse onto one run so the
 *  three statement getters firing together don't each re-map + re-insert. The
 *  underlying companyfacts fetch is additionally deduped per-CIK in edgar.ts, so
 *  even annual+quarter share a single network pull. */
async function populateEdgar(sym: string, period: StatementPeriod): Promise<void> {
  const key = `${sym}:${period}`;
  const existing = edgarInFlight.get(key);
  if (existing) return existing;
  const run = (async () => {
    try {
      const stmts = await fetchStatements(sym, period);
      if (!stmts) return;
      const writes: Array<[StatementTable, FmpStatement[]]> = [
        [STATEMENT_SOURCES.income.table, stmts.income as FmpStatement[]],
        [STATEMENT_SOURCES.balance.table, stmts.balance as FmpStatement[]],
        [STATEMENT_SOURCES.cashflow.table, stmts.cashflow as FmpStatement[]],
      ];
      for (const [table, raw] of writes) {
        const rows = mapStatementRows(sym, period, raw);
        if (rows.length) await db().insert(table).values(rows).onConflictDoNothing();
      }
    } catch (err) {
      log.warn("marketdata.edgar.failed", { symbol: sym, period, error: err instanceof Error ? err.message : String(err) });
    }
  })().finally(() => edgarInFlight.delete(key));
  edgarInFlight.set(key, run);
  return run;
}

async function getStatement(
  kind: StatementKind,
  symbol: string,
  period: StatementPeriod,
  limit = 8,
): Promise<StatementRowInput[]> {
  const { table, path } = STATEMENT_SOURCES[kind];
  const sym = symbol.toUpperCase();

  const read = (n: number) =>
    db()
      .select()
      .from(table)
      .where(and(eq(table.symbol, sym), eq(table.period, period)))
      .orderBy(desc(table.fiscalDate))
      .limit(n);

  const cached = await read(STATEMENT_FETCH_LIMIT);
  if (cached.length && isStatementFresh(cached[0]?.fiscalDate ?? null, period, new Date())) {
    return cached.slice(0, limit) as StatementRowInput[];
  }

  // income / balance / cashflow → SEC EDGAR (both periods). Quarter has no FMP
  // free-tier fallback (gated), so we serve stale cache on a miss. Annual can
  // fall back to FMP when EDGAR returns nothing fresh (non-EDGAR filer). The
  // freshness re-check distinguishes "EDGAR filled it" from "only stale cache".
  if (isEdgarKind(kind)) {
    await populateEdgar(sym, period);
    const afterEdgar = await read(STATEMENT_FETCH_LIMIT);
    if (afterEdgar.length && isStatementFresh(afterEdgar[0]?.fiscalDate ?? null, period, new Date())) {
      return afterEdgar.slice(0, limit) as StatementRowInput[];
    }
    if (period === "quarter") return afterEdgar.slice(0, limit) as StatementRowInput[];
    // annual → fall through to FMP fallback below.
  }

  // ratios / estimates (any period) + annual income/balance/cashflow EDGAR-miss.
  const fmp = await fmpGet<FmpStatement[]>(
    path,
    { symbol: sym, period, limit: STATEMENT_FETCH_LIMIT },
    { softFail402: true },
  );
  if (!fmp?.length) return cached.slice(0, limit) as StatementRowInput[]; // gated/empty: serve stale if any

  const rows = mapStatementRows(sym, period, fmp);
  if (rows.length) await db().insert(table).values(rows).onConflictDoNothing();
  return (await read(limit)) as StatementRowInput[];
}

export const getIncomeStatement = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("income", s, p, n);
export const getBalanceSheet = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("balance", s, p, n);
export const getCashFlow = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("cashflow", s, p, n);
export const getRatios = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("ratios", s, p, n);
export const getEstimates = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("estimates", s, p, n);

// Fetch a deep (~2y) window so a small-`lookbackDays` caller never leaves a
// shallow cache; callers slice off what they need. Gate on freshness only (not
// row count): `lookbackDays` is calendar days but rows are trading days, so a
// count comparison would never match and would refetch every call. (See #33.)
const PRICE_FETCH_DAYS = 800;

/** Daily OHLCV with read-through caching into daily_prices. */
export async function getDailyPrices(symbol: string, lookbackDays = 400): Promise<PriceRowInput[]> {
  const sym = symbol.toUpperCase();
  const { dailyPrices } = schema;

  const read = (n: number) =>
    db()
      .select()
      .from(dailyPrices)
      .where(eq(dailyPrices.symbol, sym))
      .orderBy(desc(dailyPrices.tradeDate))
      .limit(n);

  const cached = await read(PRICE_FETCH_DAYS);
  if (cached.length && isPriceFresh(cached[0]?.tradeDate ?? null, new Date())) {
    return cached.slice(0, lookbackDays) as PriceRowInput[];
  }

  const from = new Date(Date.now() - PRICE_FETCH_DAYS * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const fmp = await fmpGet<FmpPrice[]>("historical-price-eod/full", { symbol: sym, from, to }, { softFail402: true });
  if (!fmp?.length) return cached.slice(0, lookbackDays) as PriceRowInput[];

  const rows = mapPriceRows(sym, fmp);
  if (rows.length) await db().insert(dailyPrices).values(rows).onConflictDoNothing();
  return (await read(lookbackDays)) as PriceRowInput[];
}

/** Realtime quote price — pass-through (no PIT meaning, not cached). */
export async function getQuote(symbol: string): Promise<number | null> {
  const q = await fmpGet<Array<{ price?: number | null }>>("quote", { symbol: symbol.toUpperCase() }, { softFail402: true });
  return q?.[0]?.price ?? null;
}

/**
 * FMP company profile (beta / marketCap / price / sector …). Pass-through (it
 * carries realtime price), but upserts the stable bits into `universe` as a side
 * effect (advances the universe catalog). Returns the raw FMP profile row.
 */
export async function getProfile(symbol: string): Promise<Record<string, unknown> | null> {
  const sym = symbol.toUpperCase();
  const arr = await fmpGet<Array<Record<string, unknown>>>("profile", { symbol: sym }, { softFail402: true });
  const p = arr?.[0] ?? null;
  if (p) {
    const { universe, companyProfile } = schema;
    const knownAt = new Date();
    const meta = {
      symbol: sym,
      name: typeof p.companyName === "string" ? p.companyName : null,
      sector: typeof p.sector === "string" ? p.sector : null,
      industry: typeof p.industry === "string" ? p.industry : null,
      beta: typeof p.beta === "number" ? p.beta : null,
      reportingCurrency: typeof p.currency === "string" ? p.currency : "USD",
      knownAt,
    };
    await db()
      .insert(universe)
      .values(meta)
      .onConflictDoUpdate({
        target: universe.symbol,
        set: {
          name: meta.name,
          sector: meta.sector,
          industry: meta.industry,
          beta: meta.beta,
          reportingCurrency: meta.reportingCurrency,
          knownAt: meta.knownAt,
        },
      });
    // Persist the full profile row for the symbol Overview tab (universe keeps only
    // the slim identity used by joins).
    await db()
      .insert(companyProfile)
      .values({ symbol: sym, data: p, knownAt })
      .onConflictDoUpdate({ target: companyProfile.symbol, set: { data: p, knownAt } });
  }
  return p;
}

/** A peer's valuation multiples, for cross-check models. Shared-defined so alpha maps it to its own type. */
export interface PeerMultiples {
  ticker: string;
  market_cap: number | null;
  trailing_pe: number | null;
  ev_ebitda: number | null;
  ev_revenue: number | null;
}

/**
 * Best-effort peer multiples for the multiples / EBITDA-exit models. Pulls the
 * peer list (`stock-peers`) then each peer's latest annual `ratios` (cached).
 * Multiples are at the peer's fiscal-date price (approximation). Any failure /
 * premium-gating yields fewer (or zero) peers — callers degrade to DCF-only.
 */
export async function getPeers(symbol: string, max = 6): Promise<PeerMultiples[]> {
  const sym = symbol.toUpperCase();
  const list = await fmpGet<Array<{ symbol?: string; mktCap?: number }>>("stock-peers", { symbol: sym }, { softFail402: true });
  if (!list?.length) return [];
  const peers = list.filter((p) => p.symbol && p.symbol.toUpperCase() !== sym).slice(0, max);

  // Bounded fan-out: at most PEER_FETCH_CONCURRENCY peer `ratios` calls in flight,
  // and each peer's failure is isolated (logged, mapped to null) so one bad symbol
  // never aborts the batch — callers degrade to whatever peers did resolve.
  const out = await mapLimit(peers, PEER_FETCH_CONCURRENCY, async (peer): Promise<PeerMultiples | null> => {
    try {
      const r = await getRatios(peer.symbol!, "annual", 1);
      const d = (r[0]?.data ?? {}) as Record<string, unknown>;
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      return {
        ticker: peer.symbol!.toUpperCase(),
        market_cap: typeof peer.mktCap === "number" ? peer.mktCap : null,
        trailing_pe: n(d.priceToEarningsRatio),
        ev_ebitda: n(d.enterpriseValueMultiple),
        ev_revenue: n(d.priceToSalesRatio), // P/S as an EV/Revenue proxy (v1)
      };
    } catch (err) {
      log.warn("marketdata.peers.symbol_failed", {
        symbol: peer.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });
  return out.filter((p): p is PeerMultiples => p !== null);
}

// Sporadic per-symbol event-record caches (ratings / insider / price targets).
// Re-exported at the bottom: records.ts imports easternToUtc back from here, so
// keeping this after that definition makes the cycle's eval order obvious.
export * from "./records.js";
