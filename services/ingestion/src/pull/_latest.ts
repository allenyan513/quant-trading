/**
 * Per-symbol reducer shared by all pullers. Each puller maps + filters its raw
 * FMP rows into candidate events of ONE event_type, then collapses to the most
 * recent event per symbol. Across the N /pull/* endpoints a symbol still gets up
 * to N events (one per type) — this only dedupes WITHIN a single type/pull.
 *
 * History isn't lost: external_ids are the real event ids, so successive pulls
 * accumulate the timeline in the `events` table for analysis to read back.
 */
import type { EventPayload } from "@qt/shared";

const ts = (s?: string | null): number => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

/** Keep only the latest (by observed_at) event per symbol. */
export function latestPerSymbol(events: EventPayload[]): EventPayload[] {
  const best = new Map<string, EventPayload>();
  for (const e of events) {
    const cur = best.get(e.symbol);
    if (!cur || ts(e.observed_at) > ts(cur.observed_at)) best.set(e.symbol, e);
  }
  return [...best.values()];
}
