"use client";

/**
 * Near-real-time quote polling for the live price ticking. SWR polls /api/quotes
 * (which forwards to data's read-through quote cache) ONLY during US market hours
 * — off-hours the close is final, so we stop hitting FMP entirely. Used by the
 * watchlist (refreshes data_quotes for its symbols; the overview overlay then
 * shows them) and the symbol decision panel (live price + day change).
 */

import useSWR from "swr";
import { isUsMarketOpen } from "@qt/shared/market-hours";

export interface LiveQuote {
  symbol: string;
  price: number;
  changePct: number | null;
  prevClose: number | null;
  fetchedAt: string;
}

const fetcher = async (url: string): Promise<{ quotes: LiveQuote[] }> => {
  const r = await fetch(url);
  const j = (await r.json()) as { ok?: boolean; data?: { quotes: LiveQuote[] }; error?: string };
  if (!j.ok || !j.data) throw new Error(j.error ?? "quote fetch failed");
  return j.data;
};

const QUOTE_POLL_MS = 15_000;

/** Poll live quotes for `symbols`, market-hours-gated. Returns a symbol→quote map
 *  (empty until the first response). Pass a stable, de-duplicated symbol list. */
export function useQuotes(symbols: string[]): Map<string, LiveQuote> {
  const key = symbols.length ? `/api/quotes?symbols=${symbols.join(",")}` : null;
  const { data } = useSWR(key, fetcher, {
    // A function interval lets SWR re-evaluate market hours each tick: poll during
    // the session, fully idle (0 = no polling) off-hours and on weekends/holidays.
    refreshInterval: () => (isUsMarketOpen() ? QUOTE_POLL_MS : 0),
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  const map = new Map<string, LiveQuote>();
  for (const q of data?.quotes ?? []) map.set(q.symbol, q);
  return map;
}
