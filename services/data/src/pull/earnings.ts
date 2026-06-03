/**
 * Pull recent earnings events from FMP and turn them into EventPayloads.
 * v1: uses the earnings calendar. PIT persistence of the underlying statements
 * is a separate concern (M1 widening); here we only emit the *event*.
 *
 * PIT note (#5): the earnings-calendar endpoint exposes NO acceptedDate. Its
 * fields are `date` (report date, day granularity) + `lastUpdated` (an FMP
 * data-refresh timestamp that can post-date the event by weeks — e.g. a
 * 2026-04-30 report carrying lastUpdated 2026-06-03). So `observed_at` = `date`
 * is the best available "knowable at" stamp; we deliberately do NOT use
 * `lastUpdated` (it would leak look-ahead) and never `now()` (ingest clock).
 * This is a day-granularity approximation: an after-close (amc) release becomes
 * knowable that evening but we stamp it to the calendar day. Acceptable for the
 * event; true PIT lives on the statement tables' `known_at`.
 */
import { fmpGet, type EventPayload } from "@qt/shared";

export interface FmpEarning {
  symbol: string;
  date: string;
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
  /** FMP data-refresh timestamp. NOT a PIT stamp — see file header. */
  lastUpdated?: string | null;
}

function directionHint(e: FmpEarning): EventPayload["direction_hint"] {
  if (e.epsActual == null || e.epsEstimated == null) return null;
  if (e.epsActual > e.epsEstimated) return "bullish";
  if (e.epsActual < e.epsEstimated) return "bearish";
  return null;
}

/**
 * Pure: earnings-calendar rows -> events. Keeps only reported earnings
 * (epsActual present), optionally filters to `symbols`. `observed_at` is the
 * report `date` (PIT note above), never `lastUpdated`/`now()`.
 */
export function mapEarnings(rows: FmpEarning[], opts: { symbols?: string[] }): EventPayload[] {
  const filter = opts.symbols ? new Set(opts.symbols.map((s) => s.toUpperCase())) : null;
  return rows
    .filter((e) => e.epsActual != null) // only reported earnings are actionable events
    .filter((e) => !filter || filter.has(e.symbol.toUpperCase()))
    .map((e): EventPayload => ({
      source: "fmp",
      external_id: `earnings:${e.symbol}:${e.date}`,
      symbol: e.symbol.toUpperCase(),
      event_type: "earnings",
      direction_hint: directionHint(e),
      headline: `${e.symbol} earnings ${e.date}: EPS ${e.epsActual} vs est ${e.epsEstimated}`,
      observed_at: e.date, // PIT: report date, not lastUpdated/now — see header
      raw: e as unknown as Record<string, unknown>,
    }));
}

export async function pullEarnings(opts: {
  from: string;
  to: string;
  symbols?: string[];
}): Promise<EventPayload[]> {
  const rows =
    (await fmpGet<FmpEarning[]>("earnings-calendar", { from: opts.from, to: opts.to })) ?? [];
  return mapEarnings(rows, { symbols: opts.symbols });
}
