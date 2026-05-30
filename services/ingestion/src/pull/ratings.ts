/**
 * Pull analyst rating / price-target changes from FMP into EventPayloads.
 * NOTE: the exact FMP endpoint/field names vary by plan; `grades-historical`
 * is used here and is easy to swap. Each grade row becomes one event.
 */
import { fmpGet, type EventPayload } from "@qt/shared";

interface FmpGrade {
  symbol: string;
  date: string;
  gradingCompany?: string;
  previousGrade?: string;
  newGrade?: string;
  action?: string; // upgrade | downgrade | initiate | maintain
}

function directionHint(g: FmpGrade): EventPayload["direction_hint"] {
  const a = (g.action ?? "").toLowerCase();
  if (a.includes("up")) return "bullish";
  if (a.includes("down")) return "bearish";
  return null;
}

export async function pullRatings(symbols: string[]): Promise<EventPayload[]> {
  const out: EventPayload[] = [];
  for (const symbol of symbols) {
    const rows =
      (await fmpGet<FmpGrade[]>("grades-historical", { symbol }, { softFail402: true })) ?? [];
    for (const g of rows) {
      out.push({
        source: "fmp",
        external_id: `grade:${g.symbol}:${g.date}:${g.gradingCompany ?? "?"}`,
        symbol: g.symbol.toUpperCase(),
        event_type: "grade_change",
        direction_hint: directionHint(g),
        headline: `${g.gradingCompany ?? "Analyst"} ${g.action ?? "rated"} ${g.symbol}: ${g.previousGrade ?? "?"} -> ${g.newGrade ?? "?"}`,
        observed_at: g.date,
        raw: g as unknown as Record<string, unknown>,
      });
    }
  }
  return out;
}
