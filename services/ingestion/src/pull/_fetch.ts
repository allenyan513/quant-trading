/**
 * Bounded-concurrency per-symbol fetch shared by the per-symbol pullers.
 * Fetches `batchSize` symbols at a time (not unbounded Promise.all, not fully
 * serial) and isolates per-symbol failures so one bad request doesn't abort the
 * rest. fmpGet already throttles+retries globally; this caps in-flight fan-out.
 */
import { log } from "../log.js";

export async function fetchPerSymbol<T>(
  symbols: string[],
  fetchOne: (symbol: string) => Promise<T[] | null>,
  opts: { label: string; batchSize?: number },
): Promise<Array<{ symbol: string; rows: T[] }>> {
  const batchSize = opts.batchSize ?? 10;
  const out: Array<{ symbol: string; rows: T[] }> = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const chunk = symbols.slice(i, i + batchSize);
    const res = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          return { symbol, rows: (await fetchOne(symbol)) ?? [] };
        } catch (err) {
          log.warn(`${opts.label}.symbol_failed`, {
            symbol,
            error: err instanceof Error ? err.message : String(err),
          });
          return { symbol, rows: [] as T[] };
        }
      }),
    );
    out.push(...res);
  }
  return out;
}
