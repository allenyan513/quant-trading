/**
 * Read-through market-data cache — System A's data layer.
 *
 * analysis asks for fundamentals / prices; we serve from the PIT tables when
 * they're fresh, else fetch from FMP, persist (known_at = acceptedDate, rows are
 * immutable so onConflictDoNothing), and return. This keeps ingestion a pure
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

/** Pure: FMP statement rows → PIT table rows. known_at = acceptedDate (PIT). */
export function mapStatementRows(symbol: string, period: StatementPeriod, rows: FmpStatement[]): StatementRowInput[] {
  const out: StatementRowInput[] = [];
  for (const r of rows) {
    if (!r.date) continue; // need a fiscal date (part of the PK)
    out.push({
      symbol,
      period,
      fiscalDate: r.date,
      knownAt: r.acceptedDate ? easternToUtc(r.acceptedDate) : new Date(`${r.date}T00:00:00Z`),
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

async function getStatement(
  kind: StatementKind,
  symbol: string,
  period: StatementPeriod,
  limit = 8,
): Promise<StatementRowInput[]> {
  const { table, path } = STATEMENT_SOURCES[kind];
  const sym = symbol.toUpperCase();

  const read = () =>
    db()
      .select()
      .from(table)
      .where(and(eq(table.symbol, sym), eq(table.period, period)))
      .orderBy(desc(table.fiscalDate))
      .limit(limit);

  const existing = await read();
  if (existing.length && isStatementFresh(existing[0]?.fiscalDate ?? null, period, new Date())) {
    return existing as StatementRowInput[];
  }

  const fmp = await fmpGet<FmpStatement[]>(path, { symbol: sym, period, limit }, { softFail402: true });
  if (!fmp?.length) return existing as StatementRowInput[]; // premium-gated/empty: serve stale if any

  const rows = mapStatementRows(sym, period, fmp);
  if (rows.length) await db().insert(table).values(rows).onConflictDoNothing();
  return (await read()) as StatementRowInput[];
}

export const getIncomeStatement = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("income", s, p, n);
export const getBalanceSheet = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("balance", s, p, n);
export const getCashFlow = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("cashflow", s, p, n);
export const getRatios = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("ratios", s, p, n);
export const getEstimates = (s: string, p: StatementPeriod = "annual", n?: number) => getStatement("estimates", s, p, n);

/** Daily OHLCV with read-through caching into daily_prices. */
export async function getDailyPrices(symbol: string, lookbackDays = 400): Promise<PriceRowInput[]> {
  const sym = symbol.toUpperCase();
  const { dailyPrices } = schema;

  const read = () =>
    db()
      .select()
      .from(dailyPrices)
      .where(eq(dailyPrices.symbol, sym))
      .orderBy(desc(dailyPrices.tradeDate))
      .limit(lookbackDays);

  const existing = await read();
  if (existing.length && isPriceFresh(existing[0]?.tradeDate ?? null, new Date())) {
    return existing as PriceRowInput[];
  }

  const from = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const fmp = await fmpGet<FmpPrice[]>("historical-price-eod/full", { symbol: sym, from, to }, { softFail402: true });
  if (!fmp?.length) return existing as PriceRowInput[];

  const rows = mapPriceRows(sym, fmp);
  if (rows.length) await db().insert(dailyPrices).values(rows).onConflictDoNothing();
  return (await read()) as PriceRowInput[];
}

/** Realtime quote price — pass-through (no PIT meaning, not cached). */
export async function getQuote(symbol: string): Promise<number | null> {
  const q = await fmpGet<Array<{ price?: number | null }>>("quote", { symbol: symbol.toUpperCase() }, { softFail402: true });
  return q?.[0]?.price ?? null;
}
