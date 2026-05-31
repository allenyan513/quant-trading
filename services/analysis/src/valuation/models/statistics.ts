// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Shared statistical helpers used across valuation modules.
// ============================================================

/** Median of a numeric array. Returns 0 for empty input. */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 25th and 75th percentiles. Falls back to ±30% of median when array is empty. */
export function percentiles(arr: number[], fallbackMedian: number): { p25: number; p75: number } {
  if (arr.length === 0) return { p25: fallbackMedian * 0.7, p75: fallbackMedian * 1.3 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p25: sorted[Math.floor(sorted.length * 0.25)] ?? fallbackMedian * 0.7,
    p75: sorted[Math.floor(sorted.length * 0.75)] ?? fallbackMedian * 1.3,
  };
}

/** Percentile rank: what % of sorted values are strictly below current. */
export function computePercentile(sorted: number[], current: number): number {
  const belowCount = sorted.filter((v) => v < current).length;
  return Math.round((belowCount / sorted.length) * 100);
}

/** Round to 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}