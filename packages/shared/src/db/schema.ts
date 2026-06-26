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
 * The catalog. `watchlist` (below) is now a per-user followed-symbols list.
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

/**
 * Full FMP company profile (description / CEO / employees / address / website /
 * exchange / ipoDate …) — one upserted row per symbol. `universe` keeps the slim
 * identity (name/sector/industry/beta) that drives joins; this holds the richer
 * profile shown on the symbol Overview tab. Written only by data (warm → getProfile).
 */
export const companyProfile = pgTable("data_company_profile", {
  symbol: text("symbol").primaryKey(),
  data: jsonb("data").notNull(), // raw FMP profile row
  knownAt: timestamp("known_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

/**
 * `watchlist` (data_watchlist) — each user's PRIVATE followed symbols.
 * Per-user (PK [user_id, symbol], FK → auth_user, cascade). data owns the writes
 * (web forwards, T12); web reads scoped to the session user.
 *
 * NOTE: this table used to be the GLOBAL "house universe" (source/discovery/TTL)
 * that drove the refresh / valuation-sweep / discovery pipelines. When the parallel
 * `user_watchlist` was collapsed back into this single table, that house role was
 * dropped and those proactive sweeps were SEVERED (reactive news/alpha paths are
 * unaffected). Re-driving proactive coverage is tracked in a follow-up issue.
 */
export const watchlist = pgTable(
  "data_watchlist",
  {
    userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
    listId: text("list_id").references(() => watchlistLists.id, { onDelete: "set null" }), // null = "All"/ungrouped
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] })],
);

/**
 * Per-user named watchlist groups (tabs, IBKR-style). `data_watchlist.list_id`
 * points here; deleting a list set-nulls its members (they fall back to "All").
 * data owns it (T12); web forwards create/rename/delete and reads it scoped to the user.
 */
export const watchlistLists = pgTable("data_watchlist_lists", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
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

export const priceTargets = pgTable(
  "data_price_targets",
  recordCols,
  (t) => [
    primaryKey({ columns: [t.symbol, t.externalId] }),
    index("idx_price_targets_symbol_observed").on(t.symbol, t.observedAt),
  ],
);

// Dividend history (ex/record/payment dates + amount + yield). Same record-cache
// shape; `external_id` = the ex-dividend date, `observed_at` = declaration date
// (PIT — when the dividend became public). Shown on the symbol Financials tab.
export const dividends = pgTable(
  "data_dividends",
  recordCols,
  (t) => [
    primaryKey({ columns: [t.symbol, t.externalId] }),
    index("idx_dividends_symbol_observed").on(t.symbol, t.observedAt),
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
    dataset: text("dataset").notNull(), // "ratings" | "insider" | "price_targets" | "warm"
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.dataset] })],
);

// Near-real-time quote cache (NOT PIT, ephemeral): one latest row per symbol,
// refreshed read-through from FMP `quote` during market hours (TTL-gated, ~20s).
// Backs the live price ticking on the watchlist + symbol detail; the daily-bar
// tables stay the source of truth for charts/valuation. Money stored raw.
export const quotes = pgTable("data_quotes", {
  symbol: text("symbol").primaryKey(),
  price: doublePrecision("price").notNull(),
  changePct: doublePrecision("change_pct"), // % vs previous close (FMP changePercentage)
  prevClose: doublePrecision("prev_close"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

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

// ---- Holdings — live IBKR account mirror (Flex sync) = the Live ledger ----
//
// The user's REAL brokerage account, synced from IBKR Flex by the PORTFOLIO service's
// `/jobs/sync-holdings` (moved from data, PR-A — portfolio owns the trading-accounts
// domain incl. its own external sync). Distinct from `portfolio_positions` (the
// Strategy signal-sim) and `portfolio_paper_*` (the Paper account) — these mirror
// what's actually held. `account_id` = the user's id (per-user). Money stored raw;
// `nav_index`/`daily_return` are derived for the NAV-vs-SPY chart + KPIs. SPY
// benchmark reuses `data_daily_prices` (shared marketdata read-through, no separate
// benchmark table). Written only by portfolio.

// Holdings (IBKR) connection credentials, one row per account. Single-user today
// (account_id = config.holdingsAccountId(), default "me"); the table shape
// generalizes to multi-user (one row per user) with no migration. The Flex
// token is stored PLAINTEXT by explicit choice — keep `DATABASE_URL` pointed at
// a trusted role and don't expose this table to the web read role's queries
// (web reads a masked status only). Written only by portfolio (POST /holdings/credentials).
export const holdingsAccounts = pgTable("portfolio_holdings_accounts", {
  accountId: text("account_id").primaryKey(),
  flexToken: text("flex_token").notNull(),
  flexQueryId: text("flex_query_id").notNull(),
  label: text("label"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// Daily NAV: one row per (account, date). `daily_return` (TWR) compounds into a
// base-100 `nav_index` for the chart; `ending_nav` keeps the raw $ for the KPI row.
export const holdingsNavHistory = pgTable(
  "portfolio_holdings_nav_history",
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
  "portfolio_holdings_trades",
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
  "portfolio_holdings_positions",
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

// ---- SEC 13D/13G beneficial ownership (data) ----
// Schedule 13D (activist, >5%, ~10-day deadline) / 13G (passive, >5%) disclosures —
// the symbol-centric companion to 13F: for a stock, who has filed a >5% stake on it.
// Roster-driven like 13F (we track ~15-20 activist filers; only their filings appear).
// SEC-only (no FMP fallback). See @qt/shared/ownership.

/** Curated roster of activist / large-stake filers we track, by CIK (e.g. Icahn). */
export const ownershipFilers = pgTable("data_ownership_filers", {
  cik: text("cik").primaryKey(), // 10-digit zero-padded
  name: text("name").notNull(),
  label: text("label"), // short display handle, e.g. "Icahn"
  active: boolean("active").default(true).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// One immutable row per filing, keyed by accession (globally unique — a 13D/13G is an
// atomic document; no quarter/period concept, PIT key is filed_date only). An
// amendment (…/A) is its own filing with its own accession → its own row; the read
// layer picks the latest filed per (filer, subject, schedule) as the current position.
// subject_ticker is denormalized at write time (resolved from the filing header's
// SUBJECT-COMPANY CIK → that company's submissions tickers[0]) so symbol queries are a
// direct indexed lookup. cusip / pct_of_class / shares_owned come from the unstructured
// cover page and are BEST-EFFORT NULLABLE (often unparseable). Written only by data.
export const ownershipFilings = pgTable(
  "data_ownership_filings",
  {
    accessionNumber: text("accession_number").primaryKey(),
    filerCik: text("filer_cik").notNull(),
    filerName: text("filer_name").notNull(),
    formType: text("form_type").notNull(), // "SC 13D" | "SC 13G" | "SC 13D/A" | "SC 13G/A"
    schedule: text("schedule").notNull(), // "13D" | "13G" (derived, for query convenience)
    isAmendment: boolean("is_amendment").notNull(),
    subjectCik: text("subject_cik").notNull(),
    subjectName: text("subject_name").notNull(),
    subjectTicker: text("subject_ticker"), // resolved tickers[0]; null = unresolved (foreign/private/delisted)
    cusip: text("cusip"), // cover page, best-effort
    pctOfClass: doublePrecision("pct_of_class"), // cover page, best-effort (often null)
    sharesOwned: doublePrecision("shares_owned"), // cover page, best-effort (often null)
    filedDate: date("filed_date").notNull(),
    /** Filing date — what was knowable when (PIT). */
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_ownership_subject_ticker").on(t.subjectTicker),
    index("idx_ownership_subject_cik").on(t.subjectCik),
    index("idx_ownership_filer").on(t.filerCik),
    index("idx_ownership_filed").on(t.filedDate),
  ],
);

// Subject CIK → ticker cache (the one external lookup this pipeline does: the 13D/13G
// header gives the subject company's CIK; its ticker comes from that company's
// submissions `tickers[0]`). A NULL `ticker` is a negative-cache tombstone (subject
// isn't a US-listed equity), so sync stops re-fetching it. Written only by data.
export const ownershipSubjects = pgTable("data_ownership_subjects", {
  cik: text("cik").primaryKey(), // subject company CIK, 10-digit
  ticker: text("ticker"), // null = resolved, no ticker (tombstone)
  name: text("name"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

// ---- SEC 8-K material events (data; symbol-centric) ----
// Official "current report" filings. The item codes (2.02 earnings, 5.02 leadership,
// 1.03 bankruptcy, 8.01 other, …) come STRUCTURED from the submissions feed's `items`
// field — no document parsing. One immutable row per filing (accession PK). data owns;
// web reads. The alpha-feed (8-K → data_events → repricing) is a separate follow-up
// (#103 part 2); this table is the foundation. symbol is the subject company ticker
// (the filer IS the subject), denormalized for the symbol query.
export const eightKFilings = pgTable(
  "data_8k_filings",
  {
    accessionNumber: text("accession_number").primaryKey(),
    cik: text("cik").notNull(),
    symbol: text("symbol").notNull(),
    items: text("items").notNull(), // raw item-code CSV from submissions, e.g. "2.02,9.01"
    filedDate: date("filed_date").notNull(),
    reportDate: date("report_date"), // date of the triggering event (8-K cover); may be null
    primaryDocument: text("primary_document"),
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(), // acceptance datetime (PIT)
  },
  (t) => [index("idx_8k_symbol").on(t.symbol), index("idx_8k_filed").on(t.filedDate)],
);

// ---- SEC Form 4 insider transactions (data; symbol-centric, direct from SEC) ----
// Direct-from-SEC replacement for FMP insider data: Form 4 (statement of changes in
// beneficial ownership) carries the transaction CODE (P open-market buy, S sell, M
// option exercise, A grant, F tax, G gift, …), the 10b5-1 plan flag, and derivative
// vs non-derivative — all of which FMP flattened away. One row per transaction within a
// filing (PK = accession + ordinal). data owns; web reads (Ownership tab). Sole insider
// source — the legacy FMP `data_insider` cache was retired (#132). See #104.
export const form4Transactions = pgTable(
  "data_form4",
  {
    accessionNumber: text("accession_number").notNull(),
    txnIndex: integer("txn_index").notNull(), // ordinal within the filing (multi-txn forms)
    symbol: text("symbol").notNull(), // issuerTradingSymbol from the form
    issuerCik: text("issuer_cik").notNull(),
    reportingName: text("reporting_name").notNull(),
    reportingCik: text("reporting_cik"),
    relationship: text("relationship"), // "Director" / "Officer" / "10% Owner" (joined)
    officerTitle: text("officer_title"),
    transactionCode: text("transaction_code").notNull(), // P|S|M|A|F|G|D|C|X|W|…
    acquiredDisposed: text("acquired_disposed"), // "A" | "D"
    shares: doublePrecision("shares"),
    pricePerShare: doublePrecision("price_per_share"), // null for grants/gifts
    securityTitle: text("security_title"),
    isDerivative: boolean("is_derivative").default(false).notNull(),
    sharesOwnedAfter: doublePrecision("shares_owned_after"),
    is10b5_1: boolean("is_10b5_1").default(false).notNull(),
    transactionDate: date("transaction_date"),
    filedDate: date("filed_date").notNull(),
    knownAt: timestamp("known_at", { withTimezone: true }).notNull(), // acceptance datetime (PIT)
  },
  (t) => [
    primaryKey({ columns: [t.accessionNumber, t.txnIndex] }),
    index("idx_form4_symbol").on(t.symbol, t.filedDate),
    index("idx_form4_filed").on(t.filedDate),
  ],
);

// ---- Enriched earnings calendar (Discover; data owns the write, web reads). Cached
// daily by the enrich job (FMP earnings-calendar + getProfile market cap / logo /
// sector) so the grid can rank the top-N by market cap per day. Mutable: estimates
// firm up and actuals/market cap refresh, so it's an upsert (not an immutable PIT row).
export const earningsCalendar = pgTable(
  "data_earnings_calendar",
  {
    symbol: text("symbol").notNull(),
    reportDate: date("report_date").notNull(),
    name: text("name"),
    epsEstimated: doublePrecision("eps_estimated"),
    epsActual: doublePrecision("eps_actual"),
    revenueEstimated: doublePrecision("revenue_estimated"),
    revenueActual: doublePrecision("revenue_actual"),
    marketCap: doublePrecision("market_cap"),
    sector: text("sector"),
    logoUrl: text("logo_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.reportDate] }),
    index("idx_earnings_cal_date").on(t.reportDate),
    index("idx_earnings_cal_date_cap").on(t.reportDate, t.marketCap),
  ],
);

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

// ---- Paper trading (per-user, discretionary / AI-assisted simulated account) ----
//
// Distinct from `portfolio_positions` (the house signal-driven sim above): these are
// PER-USER, ORDER-driven books you trade into from the page or via MCP. v1 = market
// orders, long equity, cash-accounted, filled at the live quote. Options / short /
// limit / automation are deferred (`asset_class` + a later negative `quantity` leave
// room). Owned by the portfolio service; web reads only.

export const paperAccounts = pgTable("portfolio_paper_accounts", {
  userId: text("user_id").primaryKey().references(() => authUser.id, { onDelete: "cascade" }),
  cash: doublePrecision("cash").notNull(),
  startingCash: doublePrecision("starting_cash").notNull(),
  realizedPnl: doublePrecision("realized_pnl").default(0).notNull(), // cumulative closed P&L
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const paperOrders = pgTable(
  "portfolio_paper_orders",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // buy|sell
    assetClass: text("asset_class").default("EQUITY").notNull(), // reserve for options
    quantity: doublePrecision("quantity").notNull(),
    fillPrice: doublePrecision("fill_price"), // null on reject
    status: text("status").notNull(), // filled|rejected
    rejectReason: text("reject_reason"), // no_price | insufficient_funds | insufficient_shares
    realizedPnl: doublePrecision("realized_pnl"), // sells only
    source: text("source").notNull(), // manual|mcp
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [
    index("idx_paper_orders_user").on(t.userId, t.createdAt),
    // Dedup retried submissions (esp. MCP). Partial: only enforced when a key is given.
    uniqueIndex("uq_paper_orders_idem").on(t.userId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const paperPositions = pgTable(
  "portfolio_paper_positions",
  {
    userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    avgCost: doublePrecision("avg_cost").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] })],
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
// provider tables (`auth_oauth_*`, below) back the `mcp()` plugin (#P2).
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

// ---- OAuth 2.1 provider tables for the Better Auth `mcp()` plugin (#P2). web's
// Better Auth instance is the Authorization Server: these hold dynamically-
// registered MCP clients (DCR), issued access/refresh tokens, and per-user consent.
// Managed ENTIRELY by Better Auth (we never query them directly — `getMcpSession`
// validates a bearer by looking up `oauthAccessToken`). Field names mirror Better
// Auth's mcp/oidc model fields; `clientId` is the OAuth client_id (indexed, not a
// hard FK — Better Auth manages the app↔token link). userId FK → auth_user cascade.
export const oauthApplication = pgTable(
  "auth_oauth_application",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    redirectUrls: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    disabled: boolean("disabled").default(false),
    userId: text("user_id").references(() => authUser.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [index("idx_oauth_app_user").on(t.userId)],
);

export const oauthAccessToken = pgTable(
  "auth_oauth_access_token",
  {
    id: text("id").primaryKey(),
    accessToken: text("access_token").notNull().unique(),
    refreshToken: text("refresh_token").unique(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    clientId: text("client_id").notNull(),
    userId: text("user_id").references(() => authUser.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [index("idx_oauth_token_client").on(t.clientId), index("idx_oauth_token_user").on(t.userId)],
);

export const oauthConsent = pgTable(
  "auth_oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").references(() => authUser.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    consentGiven: boolean("consent_given").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  (t) => [index("idx_oauth_consent_client").on(t.clientId), index("idx_oauth_consent_user").on(t.userId)],
);

// (The per-user watchlist now lives in `data_watchlist` above — there is no
// separate `user_watchlist` table.)

// ---- Morning briefs (#97) — one immutable daily portfolio brief per user. Owned
// by data (web forwards the write from the OAuth MCP `submit_morning_brief` tool,
// T12). The narrative is generated by the user's own Claude (skill + web search) and
// posted back here for archive/display; the server stores it, runs no LLM. PK
// (user_id, brief_date) → idempotent: re-submitting the same day overwrites.
export const morningBriefs = pgTable(
  "data_morning_briefs",
  {
    userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
    briefDate: date("brief_date").notNull(),
    markdown: text("markdown").notNull(),
    summary: jsonb("summary"), // optional structured summary (day P&L / movers / counts) for the list view
    codeVersion: text("code_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
  },
  // PK (user_id, brief_date) already provides the index the list query needs
  // (filter by user_id + order by brief_date), so no extra index.
  (t) => [primaryKey({ columns: [t.userId, t.briefDate] })],
);
