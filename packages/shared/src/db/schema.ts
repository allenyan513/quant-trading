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
export const universe = pgTable("data_universe", {
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
export const watchlist = pgTable("data_watchlist", {
  symbol: text("symbol").primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
  // How the symbol entered the universe: 'manual' (seeded) | 'discovery' (promoted
  // from a scanner). Discovery entries carry a reason + TTL; manual never expire.
  source: text("source").default("manual").notNull(),
  discoveryReason: text("discovery_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = permanent
});

/**
 * `candidates` — the discovery review queue. Deterministic scanners (data,
 * no LLM) flag market-wide symbols NOT on the watchlist; a human (or, later, a
 * score rule) promotes them into the watchlist. Candidates NEVER go straight to
 * alpha — promotion is the gate. Owned (written) only by data.
 */
export const candidates = pgTable(
  "data_candidates",
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
  "data_daily_prices",
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
  "data_income_statement",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const balanceSheet = pgTable(
  "data_balance_sheet",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const cashFlow = pgTable(
  "data_cash_flow",
  statementCols,
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

export const financialRatios = pgTable(
  "data_financial_ratios",
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
  "data_analyst_estimates",
  {
    symbol: text("symbol").notNull(),
    period: text("period").notNull(),
    fiscalDate: date("fiscal_date").notNull(),
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.period, t.fiscalDate] })],
);

// ---- Event-record caches (read-through, like statements/prices) ----
//
// Sporadic per-symbol records — analyst grade changes, insider (Form 4) trades,
// analyst price targets. Unlike the periodic statement caches, these have no
// guaranteed-recent row (a stock may have no grade change for weeks), so the
// data-prep agent warms them per symbol and alpha reads them as context. `data`
// is the raw FMP row (replayable); `observed_at` is the PIT moment it became
// public; `external_id` is the dedup key. Written only by data.
const recordCols = {
  symbol: text("symbol").notNull(),
  externalId: text("external_id").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(),
};

export const ratings = pgTable(
  "data_ratings",
  recordCols,
  (t) => [
    primaryKey({ columns: [t.symbol, t.externalId] }),
    index("idx_ratings_symbol_observed").on(t.symbol, t.observedAt),
  ],
);

export const insiderTrades = pgTable(
  "data_insider",
  recordCols,
  (t) => [
    primaryKey({ columns: [t.symbol, t.externalId] }),
    index("idx_insider_symbol_observed").on(t.symbol, t.observedAt),
  ],
);

export const priceTargets = pgTable(
  "data_price_targets",
  recordCols,
  (t) => [
    primaryKey({ columns: [t.symbol, t.externalId] }),
    index("idx_price_targets_symbol_observed").on(t.symbol, t.observedAt),
  ],
);

// Per-(symbol, dataset) fetch watermark for the record caches. Their freshness
// can't be inferred from row age (no recent row is the steady state for sporadic
// feeds), so we track when each (symbol, dataset) was last fetched and gate on a
// TTL — an empty fetch still advances the watermark, so "nothing happened" is
// cached, not re-fetched every run. Written only by data.
export const marketdataFetches = pgTable(
  "data_marketdata_fetches",
  {
    symbol: text("symbol").notNull(),
    dataset: text("dataset").notNull(), // "ratings" | "insider" | "price_targets"
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.dataset] })],
);

// ---- Reference valuation (System A) ----

export const valuationSnapshots = pgTable("data_valuation_snapshots", {
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

// ---- Holdings — live IBKR account mirror (Flex sync, single account) ----
//
// The maintainer's REAL brokerage account, synced from IBKR Flex by data's
// `/jobs/sync-holdings`. Distinct from `portfolio_positions` (the system's
// SIMULATED signal-driven paper book) — these mirror what's actually held.
// `account_id` is a constant label (config.holdingsAccountId(), default "me");
// kept as a column so the schema generalizes if a second account is ever added.
// Money stored raw (repo convention); `nav_index`/`daily_return` are derived for
// the NAV-vs-SPY chart + performance metrics. SPY benchmark reuses
// `data_daily_prices` (no separate benchmark table). Written only by data.

// Holdings (IBKR) connection credentials, one row per account. Single-user today
// (account_id = config.holdingsAccountId(), default "me"); the table shape
// generalizes to multi-user (one row per user) with no migration. The Flex
// token is stored PLAINTEXT by explicit choice — keep `DATABASE_URL` pointed at
// a trusted role and don't expose this table to the web read role's queries
// (web reads a masked status only). Written only by data (POST /holdings/credentials).
export const holdingsAccounts = pgTable("data_holdings_accounts", {
  accountId: text("account_id").primaryKey(),
  flexToken: text("flex_token").notNull(),
  flexQueryId: text("flex_query_id").notNull(),
  label: text("label"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// Daily NAV: one row per (account, date). `daily_return` (TWR) compounds into a
// base-100 `nav_index` for the chart; `ending_nav` keeps the raw $ for the KPI row.
export const holdingsNavHistory = pgTable(
  "data_holdings_nav_history",
  {
    accountId: text("account_id").notNull(),
    date: date("date").notNull(),
    dailyReturn: doublePrecision("daily_return").notNull(),
    navIndex: doublePrecision("nav_index").notNull(), // base = 100 at inception
    endingNav: doublePrecision("ending_nav"), // raw $ end-of-day NAV
    deposits: doublePrecision("deposits").default(0).notNull(),
    withdrawals: doublePrecision("withdrawals").default(0).notNull(),
    knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

// Executed fills: one row per (account, broker-native trade id). Trades are
// immutable once executed, so re-pulling the same day is idempotent via the PK.
export const holdingsTrades = pgTable(
  "data_holdings_trades",
  {
    accountId: text("account_id").notNull(),
    externalTradeId: text("external_trade_id").notNull(),
    tradeDate: date("trade_date"),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    action: text("action"), // BUY|SELL
    quantity: doublePrecision("quantity").notNull(),
    price: doublePrecision("price"),
    optionType: text("option_type"), // CALL|PUT|null
    strike: doublePrecision("strike"),
    expiry: date("expiry"),
    knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.externalTradeId] }),
    index("idx_holdings_trades_symbol").on(t.symbol),
    index("idx_holdings_trades_date").on(t.tradeDate),
  ],
);

// Current holdings snapshot per (account, as_of_date, symbol, option contract).
// option_type/strike/expiry are NOT-NULL with sentinels ('' / 0 / 1970-01-01)
// so the composite PK upsert matches for equities too (Postgres treats NULLs as
// distinct, which would break ON CONFLICT). `position_value` bakes in the 100x
// option multiplier; `weight_pct` is computed by us (IBKR's percentOfNAV is
// unreliable for options). A synthetic CASH row is upserted alongside.
export const holdingsPositions = pgTable(
  "data_holdings_positions",
  {
    accountId: text("account_id").notNull(),
    asOfDate: date("as_of_date").notNull(),
    symbol: text("symbol").notNull(),
    optionType: text("option_type").default("").notNull(),
    strike: doublePrecision("strike").default(0).notNull(),
    expiry: date("expiry").default("1970-01-01").notNull(),
    assetClass: text("asset_class").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    avgPrice: doublePrecision("avg_price"),
    markPrice: doublePrecision("mark_price"),
    positionValue: doublePrecision("position_value"),
    weightPct: doublePrecision("weight_pct"),
    delta: doublePrecision("delta"),
    gamma: doublePrecision("gamma"),
    theta: doublePrecision("theta"),
    vega: doublePrecision("vega"),
    knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.asOfDate, t.symbol, t.optionType, t.strike, t.expiry] }),
    index("idx_holdings_positions_asof").on(t.asOfDate),
  ],
);

// ---- 13F — legendary investor / institutional quarterly holdings (SEC) ----
//
// Managers with >$100M in 13F securities file Form 13F-HR within 45 days of
// quarter end; data parses them from SEC EDGAR (free, official) into immutable
// quarterly snapshots. Research/education only — honest limits: 45-day lag (last
// quarter's book, not live), U.S. long positions + listed puts only (no shorts,
// cash, foreign, debt). Written only by data. See @qt/shared/thirteenf.

/** Curated roster of managers we track, by CIK (e.g. Berkshire 0001067983). */
export const thirteenFFilers = pgTable("data_13f_filers", {
  cik: text("cik").primaryKey(), // 10-digit zero-padded
  name: text("name").notNull(),
  label: text("label"), // short display handle, e.g. "Buffett"
  active: boolean("active").default(true).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// One immutable row per (filer, report quarter, security, put/call). `quarter` is
// the filing's period-of-report (calendar quarter end) — the PIT identity. Same
// CIK+quarter re-pull is idempotent via the PK. put_call is NOT-NULL with a ''
// sentinel so the composite PK upsert matches plain share holdings too (PG treats
// NULLs as distinct, which breaks ON CONFLICT — same pattern as holdings_positions).
// `value` is whole dollars (normalized for the pre-2023 thousands convention).
// ticker is intentionally absent — resolved at read time via data_13f_cusip_map.
export const thirteenFHoldings = pgTable(
  "data_13f_holdings",
  {
    cik: text("cik").notNull(),
    quarter: date("quarter").notNull(), // period of report (quarter end)
    cusip: text("cusip").notNull(),
    putCall: text("put_call").default("").notNull(), // ''|Put|Call
    issuerName: text("issuer_name").notNull(),
    titleOfClass: text("title_of_class"),
    value: doublePrecision("value").notNull(), // whole USD
    shares: doublePrecision("shares").notNull(),
    accessionNumber: text("accession_number"),
    /** Filing date — what was knowable when (PIT). */
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cik, t.quarter, t.cusip, t.putCall] }),
    index("idx_13f_holdings_cik_quarter").on(t.cik, t.quarter),
    index("idx_13f_holdings_cusip").on(t.cusip),
  ],
);

// CUSIP → ticker map (the one external dependency 13F has: the info table carries
// only CUSIPs). Populated by OpenFIGI during sync + manual overrides; resolved by
// left-join at read time, so adding a mapping instantly enriches existing
// snapshots without re-pulling. A row with `ticker` NULL is a negative-cache
// tombstone: OpenFIGI had no match (option/foreign/delisted), recorded so the
// sync stops re-querying it every run. Read path shows ticker null either way
// (tombstone or no row). Written only by data.
export const thirteenFCusipMap = pgTable("data_13f_cusip_map", {
  cusip: text("cusip").primaryKey(),
  ticker: text("ticker"), // null = tried, unresolved (tombstone)
  name: text("name"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// ---- Events (data -> alpha) + outbox ----

export const events = pgTable(
  "data_events",
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
    // outbox delivery status (producer side, set by data): pending|delivered|failed.
    // NOTE: events have no consumer-side pipeline status — alpha aggregates them
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

// ---- Notifications (data -> alpha) + outbox ----

// One aggregated notification per (symbol, event_type) batch: it bundles that
// group's not-yet-delivered raw `events` into a single delivery to alpha.
// Carries BOTH the producer outbox status (delivery_status, set by data)
// and the consumer pipeline status (status, set by alpha) — same dual-status
// shape as `events`. Idempotency: batch_key = hash of the sorted member
// external_ids, so a crash-retry that regroups the same set hits the unique
// (source, batch_key) and re-delivers the existing row instead of duplicating.
export const notifications = pgTable(
  "data_notifications",
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
    // pipeline status (consumer side, set by alpha): pending|processing|done|noise
    status: text("status").default("pending").notNull(),
    // outbox delivery status (producer side, set by data): pending|delivered|failed
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

// ---- News inbox (manual FMP news flow — staging, data-owned) ----

// Staging area for the news flow (see issue #59) — the sole entry trigger: data
// fetches market-wide FMP news here (NOT into `events`), triage screens/enriches
// per symbol, the dashboard lists them newest-first, and a human selects rows to
// notify alpha. Only on "notify" are selected rows materialized into `events` +
// delivered as notifications (reusing the normal outbox). Kept separate from
// `events` so un-actioned/symbol-less articles never pollute it. Written only by data.
export const newsItems = pgTable(
  "data_news_items",
  {
    id: text("id").primaryKey(),
    // Which FMP feed it came from: press_release | general | fmp_article | stock.
    category: text("category").notNull(),
    // Normalized stable id within a category — the article url. Dedups re-pulls.
    externalId: text("external_id").notNull(),
    // Article's own ticker if any (null for macro/general news). NOT a dedup key.
    symbol: text("symbol"),
    title: text("title"),
    text: text("text"), // body/snippet (HTML stripped for fmp_article)
    url: text("url"),
    site: text("site"),
    image: text("image"),
    // PIT: source publish time (ET wall-clock -> UTC via easternToUtcIso), not now().
    publishedAt: timestamp("published_at", { withTimezone: true }),
    raw: jsonb("raw"), // full original row, for replay
    // new | notified — whether a human has pushed it to alpha yet.
    status: text("status").default("new").notNull(),
    pulledAt: timestamp("pulled_at", { withTimezone: true }).default(sql`now()`).notNull(),

    // ---- Triage (data-prep agent, issue #59) ----
    // Deterministic screen (rule pipeline, code-side hard gates): did it pass,
    // and if not, which rule rejected it + supporting detail + the rule-set version.
    screenPassed: boolean("screen_passed"),
    screenFailedRule: text("screen_failed_rule"),
    screenDetail: jsonb("screen_detail"),
    screeningVersion: text("screening_version"),
    // LLM triage (only run when the screen passed): the agent's read on the news.
    // No direction — bullish/bearish is alpha's repricing job, not triage's.
    triageSymbol: text("triage_symbol"),
    triageMaterial: boolean("triage_material"),
    triagePriority: text("triage_priority"), // low | med | high
    triageRationale: text("triage_rationale"),
    triageModel: text("triage_model"), // resp.model (provenance)
    triagePromptVersion: text("triage_prompt_version"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_news_category_external").on(t.category, t.externalId),
    index("idx_news_published").on(t.publishedAt),
    index("idx_news_status").on(t.status),
    index("idx_news_triage_priority").on(t.triagePriority),
    index("idx_news_screen_passed").on(t.screenPassed),
  ],
);

// ---- Trading signals (alpha output) ----

export const tradingSignals = pgTable(
  "alpha_trading_signals",
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

// Full LLM audit trail for a signal (T1) — written once by alpha, read rarely
// (replay / "why did the model decide this"). Kept off `trading_signals` so the
// hot table stays lean (a signal list never drags the full prompt/response).
export const signalAudits = pgTable("alpha_signal_audits", {
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
  "portfolio_positions",
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

// ---- Signal delivery outbox (alpha -> portfolio) ----

export const signalDeliveries = pgTable(
  "alpha_signal_deliveries",
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
// everything else stays in `fields`. Written by the log sink (on except under test).
export const logs = pgTable(
  "system_logs",
  {
    id: text("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).default(sql`now()`).notNull(),
    level: text("level").notNull(), // debug|info|warn|error
    service: text("service").notNull(), // data|alpha|portfolio
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

// ---- Better Auth — platform identity + OAuth Authorization Server (multi-tenant
// pivot, #P0). Owned by web's Better Auth instance (services/web/lib/auth-server.ts).
// Shapes follow Better Auth's core schema (email/password); JS keys match Better
// Auth field names (camelCase), SQL is snake_case, tables prefixed `auth_`.
// `auth_user.id` is the tenant key threaded through per-user data. The OAuth/MCP
// provider tables (oauth apps/tokens/consents) get added in Phase 2.
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(), // provider's account id (NOT a brokerage account)
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"), // hashed (email/password provider)
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// ---- Per-user app data (multi-tenant). `user_` prefix = scoped to a user
// (auth_user.id), distinct from the shared house tables. Owned/written by data
// (web forwards writes, T12); read by web scoped to the session user. ----

// A user's PRIVATE watchlist — their own followed symbols. Separate from the
// global `data_watchlist` (the house discovery universe that drives the
// refresh/valuation/discovery pipeline); this one has no pipeline role.
export const userWatchlist = pgTable(
  "user_watchlist",
  {
    userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] })],
);
