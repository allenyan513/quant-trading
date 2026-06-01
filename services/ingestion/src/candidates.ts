/**
 * Discovery candidate lifecycle. ingestion owns `candidates` + `watchlist`:
 * scanners upsert candidates; a human promotes one into the watchlist (with a
 * source + TTL) or dismisses it; an expiry sweep drops aged discovery entries.
 * Candidates are the gate — nothing reaches analysis until it's on the watchlist.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { db, dbSchema, config } from "@qt/shared";
import { log } from "./log.js";

const { candidates, watchlist } = dbSchema;

export interface CandidateInput {
  symbol: string;
  source: string;
  discoveryReason: string;
  score: number;
  detail: Record<string, unknown>;
}

/**
 * Upsert scanner hits. Refreshes the signal but never touches `status`: a
 * dismissed candidate stays dismissed, and a promoted one is already on the
 * watchlist (so the scanner filters it out and it won't reach here).
 */
export async function upsertCandidates(cands: CandidateInput[]): Promise<void> {
  if (cands.length === 0) return;
  await db()
    .insert(candidates)
    .values(
      cands.map((c) => ({
        symbol: c.symbol,
        source: c.source,
        discoveryReason: c.discoveryReason,
        score: c.score,
        detail: c.detail,
      })),
    )
    .onConflictDoUpdate({
      target: candidates.symbol,
      set: {
        source: sql`excluded.source`,
        discoveryReason: sql`excluded.discovery_reason`,
        score: sql`excluded.score`,
        detail: sql`excluded.detail`,
        lastSeenAt: new Date(),
      },
    });
}

/** Promote a candidate into the watchlist (source='discovery', TTL'd). */
export async function promoteCandidate(symbol: string): Promise<{ promoted: boolean; reason: string | null }> {
  const sym = symbol.toUpperCase();
  const [c] = await db().select().from(candidates).where(eq(candidates.symbol, sym));
  if (!c) return { promoted: false, reason: null };

  const expiresAt = new Date(Date.now() + config.discoveryTtlDays() * 24 * 3600 * 1000);
  await db()
    .insert(watchlist)
    .values({ symbol: sym, source: "discovery", discoveryReason: c.discoveryReason, expiresAt })
    .onConflictDoNothing({ target: watchlist.symbol });
  await db().update(candidates).set({ status: "promoted" }).where(eq(candidates.symbol, sym));
  log.info("candidate.promoted", { symbol: sym, reason: c.discoveryReason, expires_at: expiresAt.toISOString() });
  return { promoted: true, reason: c.discoveryReason };
}

/** Dismiss a candidate so the scanner won't resurface it. */
export async function dismissCandidate(symbol: string): Promise<{ dismissed: boolean }> {
  const sym = symbol.toUpperCase();
  const res = await db()
    .update(candidates)
    .set({ status: "dismissed" })
    .where(eq(candidates.symbol, sym))
    .returning({ symbol: candidates.symbol });
  if (res.length) log.info("candidate.dismissed", { symbol: sym });
  return { dismissed: res.length > 0 };
}

/** Drop discovery-sourced watchlist entries past their TTL. Manual entries are never touched. */
export async function expireDiscoveryWatchlist(): Promise<{ removed: number }> {
  const removed = await db()
    .delete(watchlist)
    .where(and(eq(watchlist.source, "discovery"), lt(watchlist.expiresAt, new Date())))
    .returning({ symbol: watchlist.symbol });
  if (removed.length) log.info("watchlist.expired", { removed: removed.map((r) => r.symbol) });
  return { removed: removed.length };
}
