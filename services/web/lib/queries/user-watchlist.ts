/**
 * Read query: a user's PRIVATE watchlist (user_watchlist), scoped to the caller's
 * userId. Writes (add/remove) forward to the data service (web stays read-only).
 */
import { desc, eq } from "drizzle-orm";
import { db, userWatchlist } from "../db.js";

export async function listUserWatchlist(userId: string) {
  return db()
    .select({ symbol: userWatchlist.symbol, note: userWatchlist.note, addedAt: userWatchlist.addedAt })
    .from(userWatchlist)
    .where(eq(userWatchlist.userId, userId))
    .orderBy(desc(userWatchlist.addedAt));
}
