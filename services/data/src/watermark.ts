/**
 * Per-source ingest watermark (#4). Replaces the fixed trailing pull window with
 * a resumable cursor: each /pull/* resolves its `from` from the last successful
 * pull's max observed_at (minus a safety overlap), so an outage longer than the
 * old 3-day window no longer drops events permanently, and steady-state runs stop
 * re-fetching the full trailing window. The (source, external_id) unique index on
 * `data_events` remains the backstop for the safety-overlap re-pull region.
 */
import { eq, sql } from "drizzle-orm";
import { db, dbSchema, config } from "@qt/shared";
import { log } from "./log.js";

const { pullWatermarks } = dbSchema;

const DAY_MS = 24 * 3600 * 1000;
const dayStr = (d: Date): string => d.toISOString().slice(0, 10);

/** Latest observed_at among payloads, or null if none parse. Pure (unit-tested). */
export function maxObservedAt(payloads: ReadonlyArray<{ observed_at?: string | null }>): Date | null {
  let maxMs = -Infinity;
  for (const p of payloads) {
    const t = p.observed_at ? Date.parse(p.observed_at) : NaN;
    if (!Number.isNaN(t) && t > maxMs) maxMs = t;
  }
  return maxMs > -Infinity ? new Date(maxMs) : null;
}

/**
 * Resolve the pull window for a source from its watermark. With a watermark:
 * `from` = lastEventAt - overlap. Cold start (no row yet): `from` = now - backfill.
 * `to` is always now. Day-granularity strings to match the FMP endpoints.
 */
export async function resolveWindow(sourceKey: string): Promise<{ from: string; to: string }> {
  const to = new Date();
  const rows = await db()
    .select({ lastEventAt: pullWatermarks.lastEventAt })
    .from(pullWatermarks)
    .where(eq(pullWatermarks.sourceKey, sourceKey));
  const last = rows[0]?.lastEventAt ?? null;
  const from = last
    ? new Date(last.getTime() - config.pullOverlapDays() * DAY_MS)
    : new Date(to.getTime() - config.pullBackfillDays() * DAY_MS);
  return { from: dayStr(from), to: dayStr(to) };
}

/**
 * Advance a source's watermark after a successful pull+persist. Moves the cursor
 * to the max observed_at of the pulled events; a 0-event pull keeps the existing
 * position (GREATEST ignores NULL, so the cursor never moves backwards). Best
 * effort is the caller's concern — a failure here just re-pulls the overlap next
 * run (dedup-safe), never loses events.
 */
export async function advanceWatermark(
  sourceKey: string,
  payloads: ReadonlyArray<{ observed_at?: string | null }>,
): Promise<void> {
  const lastEventAt = maxObservedAt(payloads);
  await db()
    .insert(pullWatermarks)
    .values({ sourceKey, lastEventAt, lastPulledAt: new Date(), lastCount: payloads.length })
    .onConflictDoUpdate({
      target: pullWatermarks.sourceKey,
      set: {
        lastEventAt: sql`GREATEST(${pullWatermarks.lastEventAt}, ${lastEventAt})`,
        lastPulledAt: new Date(),
        lastCount: payloads.length,
      },
    });
  log.debug("watermark.advance", { sourceKey, lastEventAt: lastEventAt?.toISOString() ?? null, count: payloads.length });
}
