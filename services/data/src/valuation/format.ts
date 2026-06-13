/** Display helpers used by the ported valuation models (from legends/value-scope/src/lib/format.ts). */

/** Format a ratio (0.123 → "12.3%"). Used in model assumption/note strings. */
export function formatRatio(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
