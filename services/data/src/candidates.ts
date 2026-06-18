/**
 * Discovery candidate lifecycle. Deterministic scanners upsert candidates; a
 * human dismisses the noise. data owns the `candidates` table.
 *
 * NOTE: the promote→watchlist path (and the discovery-TTL expiry sweep) was
 * SEVERED when the house watchlist became per-user — a candidate can no longer be
 * promoted into a global universe. Candidates are now a read-only discovery view;
 * reconnecting promotion is tracked in the follow-up issue.
 */
import { eq, sql } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { log } from "./log.js";

const { candidates } = dbSchema;

export interface CandidateInput {
  symbol: string;
  source: string;
  discoveryReason: string;
  score: number;
  detail: Record<string, unknown>;
}

/**
 * Upsert scanner hits. Refreshes the signal but never touches `status`: a
 * dismissed candidate stays dismissed.
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
