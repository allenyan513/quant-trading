/**
 * Read-through caches for sporadic per-symbol event records: analyst grade
 * changes (`grades`), insider Form-4 trades (`insider-trading/search`), and
 * analyst price targets (`price-target-news`).
 *
 * Unlike the statement/price caches, these feeds have no guaranteed-recent row
 * — a stock can go weeks without a grade change — so freshness can't be read off
 * the newest row's age. Instead each (symbol, dataset) carries a fetch watermark
 * (`data_marketdata_fetches`): within the TTL we serve cached rows (even zero),
 * past it we re-fetch. The data-prep agent warms these per symbol; alpha reads
 * them as repricing context. We store the raw FMP row (replayable) keyed by a
 * stable `external_id`; `observed_at` is the PIT moment the record became public.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { fmpGet } from "../fmp.js";

// Re-fetch a symbol's records at most once per TTL. Records land throughout the
// US market day, so a few hours keeps intraday triage fresh without re-hitting
// FMP on every notification for the same symbol.
const RECORD_TTL_MS = 12 * 60 * 60 * 1000;
// Cap rows fetched/cached per symbol. `grades` returns full history (we keep a
// deep slice); insider/price-target endpoints take an explicit limit.
const RECORD_FETCH_LIMIT = 100;

export type RecordDataset = "ratings" | "price_targets" | "dividends";

export interface RecordRowInput {
  symbol: string;
  externalId: string;
  observedAt: Date;
  data: Record<string, unknown>;
}

// ───────────────────────── FMP shapes ─────────────────────────

export interface FmpGrade {
  symbol?: string;
  date?: string; // YYYY-MM-DD, the grade-change date (PIT)
  gradingCompany?: string;
  previousGrade?: string;
  newGrade?: string;
  action?: string; // upgrade | downgrade | initiate | maintain
}

export interface FmpPriceTarget {
  symbol?: string;
  publishedDate?: string; // ISO-8601 with Z (already UTC)
  priceTarget?: number;
  priceWhenPosted?: number;
  analystCompany?: string;
  analystName?: string;
}

// ───────────────────────── pure mappers (unit-tested) ─────────────────────────

const dayToUtc = (d: string): Date => new Date(`${d.slice(0, 10)}T00:00:00Z`);

/**
 * Grade changes → records. Drops no-op `maintain` reiterations (same grade and
 * not an explicit up/down/initiate) — zero new signal, since `grades` carries no
 * price target. Keeps full history (no window filter): the cache slices on read.
 */
export function mapGradeRecords(sym: string, rows: FmpGrade[]): RecordRowInput[] {
  const out: RecordRowInput[] = [];
  for (const g of rows) {
    if (!g.date) continue;
    const a = (g.action ?? "").toLowerCase();
    const gradeChanged = (g.previousGrade ?? "") !== (g.newGrade ?? "");
    if (!gradeChanged && a !== "upgrade" && a !== "downgrade" && a !== "initiate") continue;
    out.push({
      symbol: sym,
      externalId: `grade:${sym}:${g.date}:${g.gradingCompany ?? "?"}`,
      observedAt: dayToUtc(g.date),
      data: g as Record<string, unknown>,
    });
  }
  return out;
}

/** Price targets → records. Needs a target + a published timestamp. */
export function mapPriceTargetRecords(sym: string, rows: FmpPriceTarget[]): RecordRowInput[] {
  const out: RecordRowInput[] = [];
  for (const p of rows) {
    if (p.priceTarget == null || !p.publishedDate) continue;
    out.push({
      symbol: sym,
      externalId: `pt:${sym}:${p.publishedDate}:${p.analystCompany ?? "?"}`,
      observedAt: new Date(p.publishedDate),
      data: p as Record<string, unknown>,
    });
  }
  return out;
}

export interface FmpDividend {
  symbol?: string;
  date?: string; // ex-dividend date (the dedup key)
  recordDate?: string;
  paymentDate?: string;
  declarationDate?: string; // when announced (PIT) — may be empty
  adjDividend?: number;
  dividend?: number;
  yield?: number;
}

/** Dividends → records. Keyed by ex-date; PIT = declaration date when present
 * (when the dividend became public), else the ex-date. Skips rows with no amount. */
export function mapDividendRecords(sym: string, rows: FmpDividend[]): RecordRowInput[] {
  const out: RecordRowInput[] = [];
  for (const d of rows) {
    if (!d.date) continue;
    const amount = typeof d.dividend === "number" ? d.dividend : typeof d.adjDividend === "number" ? d.adjDividend : null;
    if (amount == null) continue;
    const when = d.declarationDate && d.declarationDate.length >= 10 ? d.declarationDate : d.date;
    out.push({
      symbol: sym,
      externalId: `div:${sym}:${d.date}`,
      observedAt: dayToUtc(when),
      data: d as Record<string, unknown>,
    });
  }
  return out;
}

// ───────────────────────── cached fetchers (DB + FMP) ─────────────────────────

// The three record tables share one columns layout (schema's recordCols) but
// carry distinct table-name literals; treat them uniformly here (cast via
// unknown, as the statement caches do).
type RecordTable = typeof schema.ratings;
const asRec = (t: unknown) => t as RecordTable;

interface RecordSource {
  table: RecordTable;
  fetch: (sym: string) => Promise<RecordRowInput[]>;
}

const RECORD_SOURCES: Record<RecordDataset, RecordSource> = {
  ratings: {
    table: asRec(schema.ratings),
    fetch: async (sym) => {
      // `grades` ignores from/to/limit server-side and returns full history.
      const rows = (await fmpGet<FmpGrade[]>("grades", { symbol: sym }, { softFail402: true })) ?? [];
      return mapGradeRecords(sym, rows);
    },
  },
  price_targets: {
    table: asRec(schema.priceTargets),
    fetch: async (sym) => {
      const rows =
        (await fmpGet<FmpPriceTarget[]>(
          "price-target-news",
          { symbol: sym, limit: RECORD_FETCH_LIMIT },
          { softFail402: true },
        )) ?? [];
      return mapPriceTargetRecords(sym, rows);
    },
  },
  dividends: {
    table: asRec(schema.dividends),
    fetch: async (sym) => {
      const rows = (await fmpGet<FmpDividend[]>("dividends", { symbol: sym, limit: RECORD_FETCH_LIMIT }, { softFail402: true })) ?? [];
      return mapDividendRecords(sym, rows);
    },
  },
};

async function getRecords(dataset: RecordDataset, symbol: string, limit = 20): Promise<RecordRowInput[]> {
  const sym = symbol.toUpperCase();
  const { table, fetch } = RECORD_SOURCES[dataset];
  const { marketdataFetches } = schema;

  const read = (n: number) =>
    db()
      .select()
      .from(table)
      .where(eq(table.symbol, sym))
      .orderBy(desc(table.observedAt))
      .limit(n);

  // Freshness gate: a fetch watermark within the TTL means cached rows (even
  // zero) are current. Sporadic feeds make row-age useless here.
  const wm = await db()
    .select({ fetchedAt: marketdataFetches.fetchedAt })
    .from(marketdataFetches)
    .where(and(eq(marketdataFetches.symbol, sym), eq(marketdataFetches.dataset, dataset)));
  const fetchedAt = wm[0]?.fetchedAt ?? null;
  if (fetchedAt && Date.now() - fetchedAt.getTime() <= RECORD_TTL_MS) {
    return (await read(limit)) as RecordRowInput[];
  }

  const rows = await fetch(sym);
  if (rows.length) await db().insert(table).values(rows).onConflictDoNothing();
  // Advance the watermark even when the fetch was empty/gated, so "nothing
  // happened" is cached rather than re-fetched every run.
  await db()
    .insert(marketdataFetches)
    .values({ symbol: sym, dataset, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [marketdataFetches.symbol, marketdataFetches.dataset],
      set: { fetchedAt: new Date() },
    });
  return (await read(limit)) as RecordRowInput[];
}

/** Recent analyst grade changes for a symbol (read-through cache). */
export const getRatings = (s: string, n?: number) => getRecords("ratings", s, n);
/** Recent analyst price targets for a symbol (read-through cache). */
export const getPriceTargets = (s: string, n?: number) => getRecords("price_targets", s, n);
/** Dividend history for a symbol (read-through cache). */
export const getDividends = (s: string, n?: number) => getRecords("dividends", s, n);
