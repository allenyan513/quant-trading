/**
 * Read queries: the enriched earnings calendar (Discover grid). Reads
 * data_earnings_calendar (data owns the write — T12) directly, plus the caller's
 * own watchlist + holdings symbols so the grid can highlight "your" companies.
 * Read-only, Node runtime only.
 */
import { getEarningsCalendar } from "@qt/shared/earnings-read";
import { db } from "../db.js";
import { listWatchlistOverview } from "./watchlist.js";
import { listHoldingsPositions } from "./holdings.js";

/** Enriched earnings rows with reportDate in [from, to] (date asc). */
export const listEarningsCalendar = (from: string, to: string) => getEarningsCalendar(db(), from, to);

/** The caller's symbols across watchlist ∪ holdings (uppercased), for marking cells. */
export async function myEarningsSymbols(userId: string): Promise<string[]> {
  const [wl, pos] = await Promise.all([listWatchlistOverview(userId), listHoldingsPositions(userId)]);
  const set = new Set<string>();
  for (const w of wl) set.add(w.symbol.toUpperCase());
  for (const p of pos.positions) if (p.symbol) set.add(p.symbol.toUpperCase());
  return [...set];
}
