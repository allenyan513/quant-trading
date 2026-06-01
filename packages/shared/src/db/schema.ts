/**
 * Drizzle schema for Neon Postgres. Adapted from the proven SQLAlchemy schema in
 * `legends/quant-researcher`. Conventions:
 *  - raw numbers stored as numeric/double (format at display time)
 *  - nested/schemaless data in jsonb
 *  - composite PKs for versioned rows
 *  - PIT: financial statements carry `known_at` (= FMP acceptedDate)
 */
import {
  pgTable,
  text,
  doublePrecision,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  date,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---- Universe (catalog) & watchlist (active subset) ----

/**
 * `universe` — every stock the system knows about, plus its profile metadata.
 * The catalog. `watchlist` is the active subset we actually pull/track for.
 */
export const universe = pgTable("universe", {
  symbol: text("symbol").primaryKey(),
  name: text("name"),
  sector: text("sector"),
  industry: text("industry"),
  beta: doublePrecision("beta"),
  archetype: text("archetype"), // high_growth | mature_stable | ...
  reportingCurrency: text("reporting_currency").default("USD"),
  knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

/** `watchlist` — the symbols we actively observe (drives the /pull/* endpoints). */
export const watchlist = pgTable("watchlist", {
  symbol: text("symbol").primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
  // How the symbol entered the universe: 'manual' (seeded) | 'discovery' (promoted
  // from a scanner). Discovery entries carry a reason + TTL; manual never expire.
  source: text("source").default("manual").notNull(),
  discoveryReason: text("discovery_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = permanent
});

/**
 * `candidates` — the discovery review queue. Deterministic scanners (ingestion,
 * no LLM) flag market-wide symbols NOT on the watchlist; a human (or, later, a
 * score rule) promotes them into the watchlist. Candidates NEVER go straight to
 * analysis — promotion is the gate. Owned (written) only by ingestion.
 */
export const candidates = pgTable(
  "candidates",
  {
    symbol: text("symbol").primaryKey(),
    source: text("source").notNull(), // scanner name, e.g. "earnings_surprise"
    discoveryReason: text("discovery_reason"),
    score: doublePrecision("score"), // ranking signal, e.g. |EPS surprise|
    detail: jsonb("detail"), // raw scan row, for review
    status: text("status").default("pending").notNull(), // pending|promoted|dismissed
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).default(sql`now()`).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [index("idx_candidates_status").on(t.status)],
);

// ---- Prices ----

export const dailyPrices = pgTable(
  "daily_prices",
  {
    symbol: text("symbol").notNull(),
    tradeDate: date("trade_date").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    close: doublePrecision("close"),
    adjClose: doublePrecision("adj_close"),
    volume: bigint("volume", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.tradeDate] }),
    index("idx_prices_symbol_date").on(t.symbol, t.tradeDate),
  ],
);

// ---- Financial statements (PIT via known_at) ----

const statementCols = {
  symbol: text("symbol").notNull(),
  period: text("period").notNull(), // "annual" | "quarter"
  fiscalDate: date("fiscal_date").notNull(),
  /** FMP acceptedDate — what was knowable when. Drives PIT filtering. */
  knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(), // full line items
};

export const incomeStatement = pgTable(
  "income_statement",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const balanceSheet = pgTable(
  "balance_sheet",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const cashFlow = pgTable(
  "cash_flow",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const financialRatios = pgTable(
  "financial_ratios",
  {
    symbol: text("symbol").notNull(),
    period: text("period").notNull(),
    fiscalDate: date("fiscal_date").notNull(),
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const analystEstimates = pgTable(
  "analyst_estimates",
  {
    symbol: text("symbol").notNull(),
    period: text("period").notNull(),
    fiscalDate: date("fiscal_date").notNull(),
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

// ---- Reference valuation (System A) ----

export const valuationSnapshots = pgTable("valuation_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  symbol: text("symbol").notNull(),
  asOf: date("as_of").notNull(),
  fairValuePerShare: doublePrecision("fair_value_per_share"),
  currentPrice: doublePrecision("current_price"),
  upsidePct: doublePrecision("upside_pct"),
  verdict: text("verdict"),
  detail: jsonb("detail").notNull(), // per-model results + assumptions
  codeVersion: text("code_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (t) => [index("idx_valsnap_symbol").on(t.symbol)]);

// ---- Events (ingestion -> analysis) + outbox ----

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    symbol: text("symbol"),
    eventType: text("event_type"),
    directionHint: text("direction_hint"),
    headline: text("headline"),
    raw: jsonb("raw"),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).default(sql`now()`).notNull(),
    // outbox delivery status (producer side, set by ingestion): pending|delivered|failed.
    // NOTE: events have no consumer-side pipeline status — analysis aggregates them
    // into a `notification` and tracks pending|processing|done|noise there, not per event.
    deliveryStatus: text("delivery_status").default("pending").notNull(),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("uq_events_source_external").on(t.source, t.externalId),
    index("idx_events_delivery").on(t.deliveryStatus),
  ],
);

// ---- Notifications (ingestion -> analysis) + outbox ----

// One aggregated notification per (symbol, event_type) batch: it bundles that
// group's not-yet-delivered raw `events` into a single delivery to analysis.
// Carries BOTH the producer outbox status (delivery_status, set by ingestion)
// and the consumer pipeline status (status, set by analysis) — same dual-status
// shape as `events`. Idempotency: batch_key = hash of the sorted member
// external_ids, so a crash-retry that regroups the same set hits the unique
// (source, batch_key) and re-delivers the existing row instead of duplicating.
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    batchKey: text("batch_key").notNull(),
    symbol: text("symbol").notNull(),
    eventType: text("event_type").notNull(),
    eventIds: jsonb("event_ids").notNull(), // string[] of events.id bundled here
    count: integer("count").notNull(),
    summary: text("summary"), // human headline, e.g. "NVDA: 3 grade changes"
    observedAt: timestamp("observed_at", { withTimezone: true }), // latest member observed_at
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).default(sql`now()`).notNull(),
    // pipeline status (consumer side, set by analysis): pending|processing|done|noise
    status: text("status").default("pending").notNull(),
    // outbox delivery status (producer side, set by ingestion): pending|delivered|failed
    deliveryStatus: text("delivery_status").default("pending").notNull(),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("uq_notifications_source_batch").on(t.source, t.batchKey),
    index("idx_notifications_delivery").on(t.deliveryStatus),
    index("idx_notifications_status").on(t.status),
  ],
);

// ---- Trading signals (analysis output) ----

export const tradingSignals = pgTable(
  "trading_signals",
  {
    id: text("id").primaryKey(),
    // The aggregated notification this signal was repriced from (one signal per
    // notification). `eventId` is legacy (pre-aggregation 1:1 link) and stays
    // null for notification-sourced signals.
    notificationId: text("notification_id"),
    eventId: text("event_id"),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(), // buy|sell|hold
    targetPrice: doublePrecision("target_price"),
    stopLoss: doublePrecision("stop_loss"),
    horizonDays: integer("horizon_days"),
    conviction: text("conviction"), // low|medium|high (notification priority only)
    entryPrice: doublePrecision("entry_price"),
    fairValueBase: doublePrecision("fair_value_base"),
    deviationPct: doublePrecision("deviation_pct"),
    thesis: text("thesis"),
    generatedBy: text("generated_by"), // llm|algo
    snapshotId: text("snapshot_id"),
    // LLM provenance (T1) — full prompt/response lives in `signal_audits`.
    modelVersion: text("model_version"), // actual served model (resp.model)
    promptVersion: text("prompt_version"), // system-prompt version, bumped on change
    // Honesty/cutoff (T2): true if all priced events post-date the model's
    // knowledge cutoff (out-of-sample, look-ahead-safe); null = undetermined.
    outOfSample: boolean("out_of_sample"),
    status: text("status").notNull(), // open|target_hit|stopped_out|expired|closed
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_signals_symbol").on(t.symbol),
    // One signal per notification (NULLs are distinct, so algo signals w/o a
    // notification are unaffected).
    uniqueIndex("uq_signals_notification").on(t.notificationId),
    index("idx_signals_status").on(t.status),
  ],
);

// Full LLM audit trail for a signal (T1) — written once by analysis, read rarely
// (replay / "why did the model decide this"). Kept off `trading_signals` so the
// hot table stays lean (a signal list never drags the full prompt/response).
export const signalAudits = pgTable("signal_audits", {
  signalId: text("signal_id").primaryKey(),
  model: text("model"), // actual served model id (resp.model)
  promptVersion: text("prompt_version"),
  systemPrompt: text("system_prompt"),
  userPrompt: text("user_prompt"),
  messages: jsonb("messages"), // full multi-turn conversation incl. final emit_signal input
  turns: integer("turns"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// ---- Positions / paper book (Portfolio Construction, T7) ----

// One open position per entry signal (1:1, signal_id is PK -> idempotent intake).
// Sizing is deterministic (see @qt/shared portfolio/sizing). v1 is long-only,
// paper-money; lifecycle close fields (closed_at/exit_price/realized_return) are
// filled by a later task. Sizing inputs are snapshotted (sizing_params) and the
// sector at entry is frozen, mirroring PIT/replayability conventions elsewhere.
export const positions = pgTable(
  "positions",
  {
    signalId: text("signal_id").primaryKey(),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(), // v1 always 'buy'
    status: text("status").default("open").notNull(), // open|closed
    // sizing result (immutable snapshot at open)
    targetWeight: doublePrecision("target_weight"), // fraction of capital 0..1
    targetNotional: doublePrecision("target_notional"),
    entryPrice: doublePrecision("entry_price"),
    shares: doublePrecision("shares"),
    sectorAtEntry: text("sector_at_entry"),
    sizingReasons: jsonb("sizing_reasons"), // string[]
    sizingParams: jsonb("sizing_params"), // SizingParams snapshot for replay
    // lifecycle close (left null in v1; filled by later task)
    closedAt: timestamp("closed_at", { withTimezone: true }),
    exitPrice: doublePrecision("exit_price"),
    realizedReturn: doublePrecision("realized_return"),
    openedAt: timestamp("opened_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    index("idx_positions_status").on(t.status),
    index("idx_positions_symbol").on(t.symbol),
  ],
);

// ---- Signal delivery outbox (analysis -> evaluation) ----

export const signalDeliveries = pgTable(
  "signal_deliveries",
  {
    signalId: text("signal_id").primaryKey(),
    deliveryStatus: text("delivery_status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [index("idx_deliveries_status").on(t.deliveryStatus)],
);

// ---- Logs (structured app logs — observability dashboard sink) ----

// Best-effort sink for the structured logger (see ../log-sink.ts). Common trace
// keys (symbol/external_id/notification_id/signal_id) are promoted to indexed
// columns so the dashboard can filter and join logs to the pipeline timeline;
// everything else stays in `fields`. Written only when LOG_DB=on.
export const logs = pgTable(
  "logs",
  {
    id: text("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).default(sql`now()`).notNull(),
    level: text("level").notNull(), // debug|info|warn|error
    service: text("service").notNull(), // ingestion|analysis|evaluation
    event: text("event").notNull(), // dotted event name, e.g. pull.earnings.done
    symbol: text("symbol"),
    externalId: text("external_id"),
    notificationId: text("notification_id"),
    signalId: text("signal_id"),
    fields: jsonb("fields"),
  },
  (t) => [
    index("idx_logs_ts").on(t.ts),
    index("idx_logs_service_ts").on(t.service, t.ts),
    index("idx_logs_level").on(t.level),
    index("idx_logs_symbol").on(t.symbol),
  ],
);
