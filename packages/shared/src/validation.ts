/**
 * Honesty / look-ahead guards (T2). A signal is trustworthy as out-of-sample
 * evidence only if the LLM could not have already known the outcome — i.e. every
 * event it priced post-dates the model's knowledge cutoff. Backtests that replay
 * pre-cutoff events are contaminated (the model "predicts" what it was trained on)
 * and must be excluded from any alpha/hit-rate aggregation.
 *
 * Pure: no DB/IO. The caller supplies the priced events' observed-at times and the
 * model cutoff (both ms epoch).
 */

/**
 * True if ALL priced events are after the cutoff (out-of-sample, look-ahead-safe).
 * Returns `null` (undetermined → treat conservatively, don't count as clean) when
 * there are no events or any event's observed-at is missing.
 */
export function isOutOfSample(
  eventObservedAtMs: ReadonlyArray<number | null>,
  cutoffMs: number,
): boolean | null {
  if (eventObservedAtMs.length === 0) return null;
  if (eventObservedAtMs.some((t) => t == null)) return null;
  return eventObservedAtMs.every((t) => (t as number) > cutoffMs);
}
