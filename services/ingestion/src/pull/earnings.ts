/**
 * Pull recent earnings events from FMP and turn them into EventPayloads.
 * v1: uses the earnings calendar. PIT persistence of the underlying statements
 * is a separate concern (M1 widening); here we only emit the *event*.
 */
import { fmpGet, type EventPayload } from "@qt/shared";

interface FmpEarning {
  symbol: string;
  date: string;
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
}

function directionHint(e: FmpEarning): EventPayload["direction_hint"] {
  if (e.epsActual == null || e.epsEstimated == null) return null;
  if (e.epsActual > e.epsEstimated) return "bullish";
  if (e.epsActual < e.epsEstimated) return "bearish";
  return null;
}

export async function pullEarnings(opts: {
  from: string;
  to: string;
  symbols?: string[];
}): Promise<EventPayload[]> {
  const rows =
    (await fmpGet<FmpEarning[]>("earnings-calendar", { from: opts.from, to: opts.to })) ?? [];

  const filter = opts.symbols ? new Set(opts.symbols.map((s) => s.toUpperCase())) : null;

  return rows
    .filter((e) => e.epsActual != null) // only reported earnings are actionable events
    .filter((e) => !filter || filter.has(e.symbol.toUpperCase()))
    .map((e) => ({
      source: "fmp",
      external_id: `earnings:${e.symbol}:${e.date}`,
      symbol: e.symbol.toUpperCase(),
      event_type: "earnings",
      direction_hint: directionHint(e),
      headline: `${e.symbol} earnings ${e.date}: EPS ${e.epsActual} vs est ${e.epsEstimated}`,
      observed_at: e.date,
      raw: e as unknown as Record<string, unknown>,
    }));
}
