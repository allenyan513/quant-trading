/**
 * The active watchlist — the curated set of symbols we deep-track. data owns the
 * table (T12): seeded out-of-band (./seed-watchlist.ts), grown by discovery
 * (./candidates.ts promote), and managed by hand via the endpoints below.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";

const { watchlist } = dbSchema;

/** All symbols on the watchlist, upper-cased. */
export async function getWatchlistSymbols(): Promise<string[]> {
  const rows = await db().select({ symbol: watchlist.symbol }).from(watchlist);
  return rows.map((r) => r.symbol.toUpperCase());
}

/** Full watchlist rows (symbol-sorted), for management UIs. */
export async function listWatchlist() {
  return db().select().from(watchlist).orderBy(watchlist.symbol);
}

/** Manually add a symbol (source=manual, never expires). Idempotent. */
export async function addToWatchlist(symbol: string): Promise<{ added: boolean }> {
  const sym = symbol.trim().toUpperCase();
  // A manual add is permanent. If the symbol was previously auto-added by
  // discovery (source="discovery" + a TTL), promote it: flip source to manual
  // and clear expiresAt so the expiry sweep won't reap it. onConflictDoNothing
  // would leave the stale discovery TTL in place — a latent silent removal.
  const rows = await db()
    .insert(watchlist)
    .values({ symbol: sym, source: "manual", expiresAt: null })
    .onConflictDoUpdate({
      target: watchlist.symbol,
      set: { source: "manual", expiresAt: null },
    })
    .returning({ symbol: watchlist.symbol });
  return { added: rows.length > 0 };
}

/** Remove a symbol from the watchlist. */
export async function removeFromWatchlist(symbol: string): Promise<{ removed: boolean }> {
  const sym = symbol.trim().toUpperCase();
  const rows = await db().delete(watchlist).where(eq(watchlist.symbol, sym)).returning({ symbol: watchlist.symbol });
  return { removed: rows.length > 0 };
}
