/**
 * Centralized, validated environment config. Each service reads only the keys it
 * needs; calling `requireEnv` fails fast at boot with a clear message.
 */

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(optionalEnv("PORT", "8080")),
  databaseUrl: () => requireEnv("DATABASE_URL"),

  anthropicApiKey: () => requireEnv("ANTHROPIC_API_KEY"),
  // Models are code constants, not per-deploy knobs: a model is coupled to the
  // prompt contract + the look-ahead cutoff, so changing one is a code change
  // (bump the agent's PROMPT_VERSION, and MODEL_CUTOFF for the signal model).
  signalModel: () => "claude-opus-4-8",
  /** Model for data's lightweight news-triage agent. Cheap (Haiku): triage only
   *  screens/enriches — the pricing decision stays on signalModel. */
  triageModel: () => "claude-haiku-4-5-20251001",
  /** Knowledge cutoff of the current signal model — signals pricing events after
   *  this date are out-of-sample (look-ahead-safe). Bump alongside SIGNAL_MODEL. */
  /** Look-ahead cutoff, coupled to signalModel — bump both together (code change). */
  modelCutoff: () => new Date("2026-01-01"),

  fmpApiKey: () => requireEnv("FMP_API_KEY"),
  // Constant: the API surface is tied to the code, not a deploy knob.
  fmpBaseUrl: () => "https://financialmodelingprep.com/stable",
  fmpRateLimit: () => Number(optionalEnv("FMP_RATE_LIMIT", "250")),

  // ---- SEC EDGAR (free quarterly financials; see @qt/shared/edgar) ----
  /** SEC fair-access requires a descriptive User-Agent with contact info. Has a
   *  compliant default so zero-config works; override per deploy if desired. */
  secUserAgent: () => optionalEnv("SEC_USER_AGENT", "quant-trading research (wsyanligang@gmail.com)"),
  /** Requests/sec ceiling for SEC (their guideline is ≤10); conservative default. */
  secRateLimit: () => Number(optionalEnv("SEC_RATE_LIMIT", "8")),

  // ---- OpenFIGI (free CUSIP→ticker symbology; see @qt/shared/openfigi) ----
  // Constant base: the API surface is tied to the code, not a deploy knob.
  openfigiBaseUrl: () => "https://api.openfigi.com/v3",
  /** Optional API key. Unset works (OpenFIGI allows anonymous use at a lower
   *  rate/batch ceiling); a key raises both. Returns null when absent. */
  openfigiApiKey: () => process.env.OPENFIGI_API_KEY?.trim() || null,
  /** Requests/min ceiling. OpenFIGI throttles ~25/min anonymous (more with a
   *  key); stay just under. Batch size scales with the key (see openfigi.ts). */
  openfigiRateLimit: () => Number(optionalEnv("OPENFIGI_RATE_LIMIT", "20")),

  // ---- IBKR Flex brokerage sync (per-user) ----
  // Flex token + query id live in portfolio_holdings_accounts (set via web's "Connect
  // IBKR" form), keyed by the user's id (Better Auth user.id). The token is
  // encrypted at rest with AES-256-GCM (@qt/shared/crypto) using this 32-byte key
  // (base64 or 64-hex). Required wherever the token is read/written (portfolio service).
  holdingsEncKey: () => requireEnv("HOLDINGS_ENC_KEY"),

  // ---- Discovery / universe selection (tuning constants, not deploy knobs) ----
  /** Min |EPS surprise| (fraction) for the earnings scanner to flag a candidate. */
  scanEarningsSurprisePct: () => 0.2,

  // ---- XBRL Frames fundamental screener (#106) ----
  /** Year-ago revenue floor ($) for the fundamentals scanner — kills micro-cap 0→tiny growth noise. */
  scanFundamentalsMinBase: () => 5e8,
  /** Max candidates the fundamentals scanner queues per run (cross-sectional top-N). */
  scanFundamentalsTopN: () => 50,
  /** Min YoY growth (fraction) for the fundamentals scanner to flag a candidate. */
  scanFundamentalsMinGrowthPct: () => 0.25,

  /** 10Y Treasury proxy for WACC's risk-free rate (decimal). v1 constant; wire FMP treasury later. */
  riskFreeRate: () => Number(optionalEnv("RISK_FREE_RATE", "0.043")),

  /** Reuse a symbol's reference valuation (the slow fair value) for this many days before recomputing. */
  referenceTtlDays: () => Number(optionalEnv("REFERENCE_TTL_DAYS", "1")),

  alphaUrl: () => requireEnv("ALPHA_URL"),
  portfolioUrl: () => requireEnv("PORTFOLIO_URL"),
  dataUrl: () => requireEnv("DATA_URL"),

  /** Shared secret guarding cron/job endpoints (e.g. the daily refresh hit by
   *  GitHub Actions). Empty (local dev) = open; set in prod so only the cron can
   *  trigger jobs. Partial fix for #24 (full service-to-service auth is separate). */
  jobToken: () => optionalEnv("JOB_TOKEN", ""),

  // ---- Portfolio construction (T7) deterministic sizing params ----
  /** Total paper capital (USD). Only scales notional, not weight logic. */
  portfolioCapital: () => Number(optionalEnv("PORTFOLIO_CAPITAL", "100000")),
  /** Starting cash for a new per-user paper-trading account (USD). */
  paperStartingCash: () => Number(optionalEnv("PAPER_STARTING_CASH", "100000")),
  /** Max age (ms) of a quote's EXCHANGE timestamp before the paper engine treats it as
   *  stale (market not actively trading) and QUEUES a market order instead of filling at a
   *  stale price. Default 15 min — longer than any RTH gap, short enough to catch close. */
  paperQuoteMaxStaleMs: () => Number(optionalEnv("PAPER_QUOTE_MAX_STALE_MS", "900000")),
  /** Base weight per conviction tier (fraction of capital). */
  sizeByConviction: () => ({
    low: Number(optionalEnv("SIZE_LOW", "0.01")),
    medium: Number(optionalEnv("SIZE_MED", "0.02")),
    high: Number(optionalEnv("SIZE_HIGH", "0.03")),
  }),
  maxPositions: () => Number(optionalEnv("MAX_POSITIONS", "20")),
  maxWeightPerName: () => Number(optionalEnv("MAX_WEIGHT_PER_NAME", "0.05")),
  maxSectorWeight: () => Number(optionalEnv("MAX_SECTOR_WEIGHT", "0.30")),
};

/** Stable identifier for the running code, for snapshot/replay provenance. */
export function codeVersion(): string {
  return process.env.CODE_VERSION ?? `pkg:${process.env.npm_package_version ?? "0.1.0"}`;
}
