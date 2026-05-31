/**
 * Bounded-concurrency map. At most `limit` invocations of `fn` run at once; a
 * sliding window pulls the next item as soon as a slot frees, and results are
 * returned in input order.
 *
 * Use this instead of `Promise.all(items.map(fn))` whenever `fn` hits an external
 * API per item: the bare form fires every request simultaneously, which can burst
 * past rate limits on a wide list. `fn` owns its own error handling — if a single
 * failure must not reject the whole batch, catch inside `fn` and return a sentinel
 * (e.g. `null`) for callers to filter.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;
  let next = 0;
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return results;
}
