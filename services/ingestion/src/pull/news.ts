/**
 * Pull recent company news from FMP into EventPayloads (one event per article).
 * NOTE: the exact FMP news endpoint/field names vary by plan; `news/stock` is
 * used here and is easy to swap. direction_hint is left null on purpose —
 * judging materiality / sentiment of news is analysis's job, not ingestion's.
 */
import { fmpGet, type EventPayload } from "@qt/shared";

interface FmpNews {
  symbol?: string;
  publishedDate?: string;
  title?: string;
  text?: string;
  url?: string;
  site?: string;
}

export async function pullNews(opts: {
  from: string;
  to: string;
  symbols: string[];
  limit?: number;
}): Promise<EventPayload[]> {
  const out: EventPayload[] = [];
  for (const symbol of opts.symbols) {
    const rows =
      (await fmpGet<FmpNews[]>(
        "news/stock",
        { symbols: symbol, from: opts.from, to: opts.to, limit: opts.limit ?? 20 },
        { softFail402: true },
      )) ?? [];
    for (const n of rows) {
      if (!n.url) continue; // url is our idempotency key; skip articles without one
      out.push({
        source: "fmp",
        external_id: `news:${symbol.toUpperCase()}:${n.url}`,
        symbol: (n.symbol ?? symbol).toUpperCase(),
        event_type: "news",
        direction_hint: null,
        headline: n.title ?? null,
        observed_at: n.publishedDate ?? null, // PIT: FMP publishedDate, not now()
        raw: n as unknown as Record<string, unknown>,
      });
    }
  }
  return out;
}
