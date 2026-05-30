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
  timestamp,
  jsonb,
  date,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---- Universe ----

export const securities = pgTable("securities", {
  symbol: text("symbol").primaryKey(),
});

export const universe = pgTable("universe", {
  symbol: text("symbol").primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const profiles = pgTable("profiles", {
  symbol: text("symbol").primaryKey(),
  name: text("name"),
  sector: text("sector"),
  industry: text("industry"),
  beta: doublePrecision("beta"),
  archetype: text("archetype"), // high_growth | mature_stable | ...
  reportingCurrency: text("reporting_currency").default("USD"),
  knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

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
    // pipeline status (consumer side, set by analysis): pending|processing|done|noise
    status: text("status").default("pending").notNull(),
    // outbox delivery status (producer side, set by ingestion): pending|delivered|failed
    deliveryStatus: text("delivery_status").default("pending").notNull(),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("uq_events_source_external").on(t.source, t.externalId),
    index("idx_events_delivery").on(t.deliveryStatus),
  ],
);

// ---- Trading signals (analysis output) ----

export const tradingSignals = pgTable(
  "trading_signals",
  {
    id: text("id").primaryKey(),
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
    status: text("status").notNull(), // open|target_hit|stopped_out|expired|closed
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_signals_symbol").on(t.symbol),
    index("idx_signals_event").on(t.eventId),
    index("idx_signals_status").on(t.status),
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

// ---- Outcome tracking (evaluation) ----

export const signalOutcomes = pgTable(
  "signal_outcomes",
  {
    signalId: text("signal_id").notNull(),
    horizon: text("horizon").notNull(), // 1d|1w|1m
    priceAtHorizon: doublePrecision("price_at_horizon"),
    returnPct: doublePrecision("return_pct"),
    benchmarkReturnPct: doublePrecision("benchmark_return_pct"),
    alphaPct: doublePrecision("alpha_pct"),
    resolvedStatus: text("resolved_status"), // target_hit|stopped_out|expired|open
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.signalId, t.horizon] })],
);

// ---- Feedback / lessons store (retrieval-augmented self-optimization) ----

export const feedbackNotes = pgTable(
  "feedback_notes",
  {
    id: text("id").primaryKey(),
    signalId: text("signal_id"),
    symbol: text("symbol"),
    eventType: text("event_type"),
    lesson: text("lesson").notNull(),
    scores: jsonb("scores"), // structured critique scores
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    index("idx_feedback_symbol").on(t.symbol),
    index("idx_feedback_event_type").on(t.eventType),
  ],
);
