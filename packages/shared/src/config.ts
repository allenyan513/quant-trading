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

  // ---- Discovery / universe selection (tuning constants, not deploy knobs) ----
  /** Min |EPS surprise| (fraction) for the earnings scanner to flag a candidate. */
  scanEarningsSurprisePct: () => 0.2,
  /** TTL (days) for a discovery-promoted watchlist entry before it expires out. */
  discoveryTtlDays: () => 30,

  /** 10Y Treasury proxy for WACC's risk-free rate (decimal). v1 constant; wire FMP treasury later. */
  riskFreeRate: () => Number(optionalEnv("RISK_FREE_RATE", "0.043")),

  /** Reuse a symbol's reference valuation (the slow fair value) for this many days before recomputing. */
  referenceTtlDays: () => Number(optionalEnv("REFERENCE_TTL_DAYS", "1")),

  alphaUrl: () => requireEnv("ALPHA_URL"),
  portfolioUrl: () => requireEnv("PORTFOLIO_URL"),
  dataUrl: () => requireEnv("DATA_URL"),
  /** Base URL of the web dashboard. data's /mcp proxies web's read-only /api/* so
   *  the MCP returns exactly the dashboard's data. */
  webUrl: () => requireEnv("WEB_URL"),

  /** Shared secret guarding cron/job endpoints (e.g. the daily refresh hit by
   *  GitHub Actions) and authenticating data→web /api/* calls. Empty (local dev)
   *  = open; set in prod. Partial fix for #24 (full s2s auth is separate). */
  jobToken: () => optionalEnv("JOB_TOKEN", ""),
  /** Optional bearer guarding the public /mcp endpoint. Empty = open (read-only
   *  research data); set to require `Authorization: Bearer <MCP_TOKEN>`. */
  mcpToken: () => optionalEnv("MCP_TOKEN", ""),

  // ---- Portfolio construction (T7) deterministic sizing params ----
  /** Total paper capital (USD). Only scales notional, not weight logic. */
  portfolioCapital: () => Number(optionalEnv("PORTFOLIO_CAPITAL", "100000")),
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
