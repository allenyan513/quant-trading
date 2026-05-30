/**
 * Notification classification + noise short-circuit. Ported in spirit from
 * `legends/quant-researcher/quant_researcher/signal_system/events.py`.
 * Returning null is the cost short-circuit: noise must never reach the LLM.
 *
 * A notification bundles 1..N raw events that share (symbol, event_type); the
 * brain reprices the whole bundle into one signal.
 */
import {
  ACTIONABLE_EVENT_TYPES,
  type DirectionHint,
  type EventType,
  type NotificationPayload,
} from "@qt/shared";

/** One event inside a normalized notification bundle. */
export interface NormalizedEvent {
  external_id: string;
  directionHint: DirectionHint;
  headline: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedNotification {
  symbol: string;
  eventType: EventType;
  summary: string | null;
  events: NormalizedEvent[];
}

const ACTIONABLE = new Set<string>(ACTIONABLE_EVENT_TYPES);

export function classifyNotification(p: NotificationPayload): NormalizedNotification | null {
  const symbol = (p.symbol ?? "").trim().toUpperCase();
  const eventType = String(p.event_type ?? "").trim().toLowerCase();
  if (!symbol || !ACTIONABLE.has(eventType)) return null;

  const events: NormalizedEvent[] = (p.events ?? [])
    .filter((e) => e?.external_id)
    .map((e) => ({
      external_id: e.external_id,
      directionHint: e.direction_hint ?? null,
      headline: e.headline ?? null,
      raw: e.raw ?? {},
    }));
  if (events.length === 0) return null;

  return { symbol, eventType: eventType as EventType, summary: p.summary ?? null, events };
}
