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

  analysisUrl: () => requireEnv("ANALYSIS_URL"),
  evaluationUrl: () => requireEnv("EVALUATION_URL"),
};

/** Stable identifier for the running code, for snapshot/replay provenance. */
export function codeVersion(): string {
  return process.env.CODE_VERSION ?? `pkg:${process.env.npm_package_version ?? "0.1.0"}`;
}
