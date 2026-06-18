/**
 * Per-user private watchlist (user_watchlist). data owns the table (T12); web
 * forwards add/remove here with the session user's id. Pure user CRUD — no
 * pipeline involvement (distinct from the shared house data_watchlist).
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";

const { userWatchlist } = dbSchema;

export async function addUserWatchlist(userId: string, symbol: string, note?: string): Promise<{ userId: string; symbol: string }> {
  const uid = userId.trim();
  const sym = symbol.trim().toUpperCase();
  if (!uid || !sym) throw new Error("userId and symbol are required");
  const noteVal = note?.trim() || null;
  await db()
    .insert(userWatchlist)
    .values({ userId: uid, symbol: sym, note: noteVal })
    .onConflictDoUpdate({ target: [userWatchlist.userId, userWatchlist.symbol], set: { note: noteVal } });
  return { userId: uid, symbol: sym };
}

export async function removeUserWatchlist(userId: string, symbol: string): Promise<{ userId: string; symbol: string }> {
  const uid = userId.trim();
  const sym = symbol.trim().toUpperCase();
  if (!uid || !sym) throw new Error("userId and symbol are required");
  await db().delete(userWatchlist).where(and(eq(userWatchlist.userId, uid), eq(userWatchlist.symbol, sym)));
  return { userId: uid, symbol: sym };
}
