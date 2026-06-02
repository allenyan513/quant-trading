/**
 * Reads the active watchlist — the symbols the /pull/* endpoints default to
 * when no explicit `symbols` is given. The watchlist is seeded out-of-band
 * (see ./seed-watchlist.ts); the data service only consumes it.
 */
import { db, dbSchema } from "@qt/shared";

const { watchlist } = dbSchema;

/** All symbols on the watchlist, upper-cased. */
export async function getWatchlistSymbols(): Promise<string[]> {
  const rows = await db().select({ symbol: watchlist.symbol }).from(watchlist);
  return rows.map((r) => r.symbol.toUpperCase());
}
