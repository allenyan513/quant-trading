/**
 * Pull analyst rating / grade changes from FMP into EventPayloads.
 *
 * Endpoint = `grades` (discrete upgrade/downgrade/initiate/maintain actions with
 * gradingCompany + previousGrade + newGrade). NOTE: do NOT use `grades-historical`
 * — that returns monthly analyst-count *snapshots* (analystRatingsBuy/Hold/Sell),
 * a different shape with no grade-change fields.
 *
 * `grades` returns the FULL history (back to ~2012) and ignores from/to/limit
 * server-side, so we filter to the recent window client-side — we only act on
 * fresh grade changes, not ancient ones.
 *
 * We also drop no-op `maintain` rows (previousGrade === newGrade): `grades`
 * carries NO price target, so a reiteration at the same grade is zero new
 * signal. A target-price-only update lives in a different FMP endpoint
 * (`price-target-news` -> a future `price_target_change` event), not here.
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

export async function pullRatings(opts: {
  symbols: string[];
  from: string;
  to: string;
}): Promise<EventPayload[]> {
  const out: EventPayload[] = [];
  for (const symbol of opts.symbols) {
    const rows =
      (await fmpGet<FmpGrade[]>("grades", { symbol }, { softFail402: true })) ?? [];
    for (const g of rows) {
      // grades returns full history; keep only the recent window (date is YYYY-MM-DD).
      if (!g.date || g.date < opts.from || g.date > opts.to) continue;
      // Drop no-op reiterations: same grade and not an explicit up/down/initiate.
      const a = (g.action ?? "").toLowerCase();
      const gradeChanged = (g.previousGrade ?? "") !== (g.newGrade ?? "");
      if (!gradeChanged && a !== "upgrade" && a !== "downgrade" && a !== "initiate") continue;
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
