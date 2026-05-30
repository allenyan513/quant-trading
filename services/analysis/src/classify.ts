/**
 * Event classification + noise short-circuit. Ported from
 * `legends/quant-researcher/quant_researcher/signal_system/events.py`.
 * Returning null is the cost short-circuit: noise must never reach the LLM.
 */
import { ACTIONABLE_EVENT_TYPES, type EventPayload, type EventType } from "@qt/shared";

export interface NormalizedEvent {
  symbol: string;
  eventType: EventType;
  directionHint: EventPayload["direction_hint"];
  headline: string | null;
  raw: Record<string, unknown>;
}

const ACTIONABLE = new Set<string>(ACTIONABLE_EVENT_TYPES);

export function classify(p: EventPayload): NormalizedEvent | null {
  const symbol = (p.symbol ?? "").trim().toUpperCase();
  const eventType = String(p.event_type ?? "").trim().toLowerCase();
  if (!symbol || !ACTIONABLE.has(eventType)) return null;
  return {
    symbol,
    eventType: eventType as EventType,
    directionHint: p.direction_hint ?? null,
    headline: p.headline ?? null,
    raw: p.raw ?? {},
  };
}
