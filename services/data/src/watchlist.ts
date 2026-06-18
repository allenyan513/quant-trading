/**
 * Per-user watchlist (data_watchlist). Each user's own followed symbols. data
 * owns the table (T12); web forwards add/remove here with the session user's id,
 * and reads it directly (DB-direct, scoped to the user) for display.
 *
 * Pure user CRUD — no pipeline role. This table USED to be the global house
 * "universe" that drove the refresh / valuation-sweep / discovery crons; when the
 * parallel `user_watchlist` was collapsed back into it, that house role was
 * SEVERED (the reactive news/alpha paths are unaffected). See the follow-up issue.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";

const { watchlist } = dbSchema;

/** Add a symbol to the user's watchlist. Idempotent (updates the note on conflict). */
export async function addWatchlist(
  userId: string,
  symbol: string,
  note?: string,
): Promise<{ userId: string; symbol: string }> {
  const uid = userId.trim();
  const sym = symbol.trim().toUpperCase();
  if (!uid || !sym) throw new Error("userId and symbol are required");
  const noteVal = note?.trim() || null;
  await db()
    .insert(watchlist)
    .values({ userId: uid, symbol: sym, note: noteVal })
    .onConflictDoUpdate({ target: [watchlist.userId, watchlist.symbol], set: { note: noteVal } });
  return { userId: uid, symbol: sym };
}

/** Remove a symbol from the user's watchlist. */
export async function removeWatchlist(userId: string, symbol: string): Promise<{ userId: string; symbol: string }> {
  const uid = userId.trim();
  const sym = symbol.trim().toUpperCase();
  if (!uid || !sym) throw new Error("userId and symbol are required");
  await db().delete(watchlist).where(and(eq(watchlist.userId, uid), eq(watchlist.symbol, sym)));
  return { userId: uid, symbol: sym };
}
