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
  critiqueModel: () => optionalEnv("CRITIQUE_MODEL", "claude-sonnet-4-6"),

  fmpApiKey: () => requireEnv("FMP_API_KEY"),
  fmpBaseUrl: () => optionalEnv("FMP_BASE_URL", "https://financialmodelingprep.com/stable"),
  fmpRateLimit: () => Number(optionalEnv("FMP_RATE_LIMIT", "250")),

  /** 10Y Treasury proxy for WACC's risk-free rate (decimal). v1 constant; wire FMP treasury later. */
  riskFreeRate: () => Number(optionalEnv("RISK_FREE_RATE", "0.043")),

  /** Reuse a symbol's reference valuation (the slow fair value) for this many days before recomputing. */
  referenceTtlDays: () => Number(optionalEnv("REFERENCE_TTL_DAYS", "1")),

  analysisUrl: () => requireEnv("ANALYSIS_URL"),
  evaluationUrl: () => requireEnv("EVALUATION_URL"),
};

/** Stable identifier for the running code, for snapshot/replay provenance. */
export function codeVersion(): string {
  return process.env.CODE_VERSION ?? `pkg:${process.env.npm_package_version ?? "0.1.0"}`;
}
