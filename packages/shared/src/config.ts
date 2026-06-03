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
  signalModel: () => optionalEnv("SIGNAL_MODEL", "claude-opus-4-8"),
  /** Knowledge cutoff of the current signal model — signals pricing events after
   *  this date are out-of-sample (look-ahead-safe). Bump alongside SIGNAL_MODEL. */
  modelCutoff: () => new Date(optionalEnv("MODEL_CUTOFF", "2026-01-01")),

  fmpApiKey: () => requireEnv("FMP_API_KEY"),
  fmpBaseUrl: () => optionalEnv("FMP_BASE_URL", "https://financialmodelingprep.com/stable"),
  fmpRateLimit: () => Number(optionalEnv("FMP_RATE_LIMIT", "250")),

  // ---- Ingest watermark / cursor (#4) ----
  /** Cold-start backfill window (days) when a pull source has no watermark yet. */
  pullBackfillDays: () => Number(optionalEnv("PULL_BACKFILL_DAYS", "30")),
  /** Safety overlap (days) subtracted from the watermark on resume; the
   *  (source, external_id) dedup absorbs the re-pulled overlap region. */
  pullOverlapDays: () => Number(optionalEnv("PULL_OVERLAP_DAYS", "2")),

  // ---- Discovery / universe selection ----
  /** Min |EPS surprise| (fraction) for the earnings scanner to flag a candidate. */
  scanEarningsSurprisePct: () => Number(optionalEnv("SCAN_EARNINGS_SURPRISE_PCT", "0.20")),
  /** TTL (days) for a discovery-promoted watchlist entry before it expires out. */
  discoveryTtlDays: () => Number(optionalEnv("DISCOVERY_TTL_DAYS", "30")),

  /** 10Y Treasury proxy for WACC's risk-free rate (decimal). v1 constant; wire FMP treasury later. */
  riskFreeRate: () => Number(optionalEnv("RISK_FREE_RATE", "0.043")),

  /** Reuse a symbol's reference valuation (the slow fair value) for this many days before recomputing. */
  referenceTtlDays: () => Number(optionalEnv("REFERENCE_TTL_DAYS", "1")),

  alphaUrl: () => requireEnv("ALPHA_URL"),
  portfolioUrl: () => requireEnv("PORTFOLIO_URL"),
  dataUrl: () => requireEnv("DATA_URL"),

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
