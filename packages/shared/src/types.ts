/**
 * Domain types shared across services — the wire contracts. DB row types are
 * inferred from the Drizzle schema (see ./db/schema.ts); these are the
 * hand-written DTOs that travel over HTTP between services.
 */

// ---- Events (data -> alpha) ----

/** Event types the alpha brain acts on. Anything else is noise. */
export const ACTIONABLE_EVENT_TYPES = [
  "earnings",
  "grade_change",
  "price_target_change",
  "news",
  "insider",
  "m&a",
] as const;
export type EventType = (typeof ACTIONABLE_EVENT_TYPES)[number];

export type DirectionHint = "bullish" | "bearish" | null;

/** A single raw event. Persisted by data (dedup on source+external_id). */
export interface EventPayload {
  /** Origin system, e.g. "fmp". Part of the dedup key. */
  source: string;
  /** Stable id within the source. Part of the dedup key (idempotency). */
  external_id: string;
  symbol: string;
  event_type: EventType | string;
  direction_hint?: DirectionHint;
  headline?: string | null;
  /** When the event occurred at the source (for PIT). */
  observed_at?: string | null;
  /** Full raw payload, preserved for replay. */
  raw: Record<string, unknown>;
}

/** One bundled event inside a notification (a compact view of an EventPayload). */
export interface EventRef {
  external_id: string;
  direction_hint?: DirectionHint;
  headline?: string | null;
  observed_at?: string | null;
  raw?: Record<string, unknown>;
}

/**
 * The payload data POSTs to alpha `/notifications`: one aggregated
 * notification per (symbol, event_type) batch, bundling that group's events.
 * Alpha dedups on (source, batch_key), unpacks `events`, and reprices the
 * whole bundle into ONE signal.
 */
export interface NotificationPayload {
  /** Origin system, e.g. "fmp". Part of the dedup key. */
  source: string;
  /** Stable id for this batch (hash of member external_ids). Dedup key. */
  batch_key: string;
  symbol: string;
  event_type: EventType | string;
  /** Human headline, e.g. "NVDA: 3 grade changes". */
  summary?: string | null;
  /** The bundled events (>= 1), newest-first. */
  events: EventRef[];
}

// ---- Trading signals (alpha -> portfolio) ----

export type Direction = "buy" | "sell" | "hold";
export type Conviction = "low" | "medium" | "high";
export type SignalStatus =
  | "open"
  | "target_hit"
  | "stopped_out"
  | "expired"
  | "closed";

/** The brain's structured output (the `emit_signal` tool input). */
export interface SignalDraft {
  direction: Direction;
  target_price: number | null;
  stop_loss: number | null;
  horizon_days: number | null;
  conviction: Conviction;
  thesis: string;
}

/** The payload alpha POSTs to portfolio `/signals`. */
export interface TradingSignalDTO {
  id: string;
  /** The aggregated notification this signal was repriced from. */
  notification_id: string | null;
  /** Legacy pre-aggregation 1:1 event link; null for notification-sourced signals. */
  event_id: string | null;
  symbol: string;
  direction: Direction;
  target_price: number | null;
  stop_loss: number | null;
  horizon_days: number | null;
  conviction: Conviction;
  entry_price: number | null;
  fair_value_base: number | null;
  deviation_pct: number | null;
  thesis: string | null;
  generated_by: "llm" | "algo";
  snapshot_id: string | null;
  /** LLM provenance (T1); full prompt/response lives in signal_audits, not here. */
  model_version: string | null;
  prompt_version: string | null;
  /** Honesty/cutoff (T2): all priced events post-date the model cutoff; null = undetermined. */
  out_of_sample: boolean | null;
  status: SignalStatus;
  created_at: string;
  expires_at: string | null;
}

// ---- Valuation (System A reference valuation) ----

export type Verdict = "undervalued" | "fairly_valued" | "overvalued";

export interface ReferenceValuation {
  snapshot_id: string;
  symbol: string;
  as_of: string;
  fair_value_per_share: number | null;
  current_price: number | null;
  upside_pct: number | null;
  verdict: Verdict | null;
  /** Per-model breakdown + assumptions, schemaless. */
  detail: Record<string, unknown>;
}

// ---- Feedback (evaluation -> alpha, retrieval-augmented) ----

export interface FeedbackNote {
  id: string;
  symbol: string | null;
  event_type: string | null;
  lesson: string;
  created_at: string;
}
