import { handle } from "@/lib/api";
import { listEarningsCalendar, myEarningsSymbols } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";
import type { EarningsCalEntry } from "@qt/shared/earnings-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EarningsCalendarResponse {
  rows: EarningsCalEntry[];
  mine: string[];
}

/** Enriched, market-cap-ranked earnings calendar for [from, to] + the caller's own
 *  watchlist/holdings symbols (for highlighting). data owns data_earnings_calendar
 *  (T12); web reads it directly. Defaults to a 1-week-back / 5-week-ahead window. */
export async function GET(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  const url = new URL(req.url);
  const now = Date.now();
  const from = url.searchParams.get("from") || new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || new Date(now + 35 * 86_400_000).toISOString().slice(0, 10);
  return handle(async () => {
    const [rows, mine] = await Promise.all([listEarningsCalendar(from, to), myEarningsSymbols(uid)]);
    return { rows, mine } satisfies EarningsCalendarResponse;
  });
}
