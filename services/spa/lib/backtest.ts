/**
 * Shared plumbing for the public dividend backtester: the request shape, the
 * window helpers, and the one hook that talks to the API.
 *
 * Two surfaces consume this — the form tool (`/tools/dividend-portfolio-backtest`,
 * which drives everything off the query string) and the preset landing pages
 * (fixed baskets, fetched on mount). Keeping the fetch in ONE hook is what stops
 * those two from drifting into lookalike implementations with different retry,
 * error and race behaviour.
 */
import { useEffect, useRef, useState } from "react";
import { apiSend } from "@/lib/api-client";
import type { DividendBacktestResult } from "@qt/shared/backtest";

/** Mirrors the server's limits (`services/data/src/backtest.ts`). */
export const MAX_HOLDINGS = 10;
export const MAX_YEARS = 10;

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const yearsAgoISO = (n: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

export interface DividendBacktestRequest {
  holdings: Array<{ symbol: string; weight: number }>;
  from: string;
  to: string;
  initial: number;
  reinvest: boolean;
}

export interface BacktestState {
  result: DividendBacktestResult | null;
  error: string | null;
  loading: boolean;
}

/** A cold marketdata cache can push a first-ever basket past the gateway's hard
 *  10s timeout to the data service. On the form page that follows a deliberate
 *  click; on a preset page it is the first thing a search visitor sees, so those
 *  pages retry once — the failed attempt usually warmed the cache. */
const RETRY_DELAY_MS = 1_500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a backtest whenever `request` changes. Passing `null` makes NO request —
 * that is how the form tool keeps a bare page load free of gateway calls.
 */
export function useDividendBacktest(
  request: DividendBacktestRequest | null,
  opts: { retry?: number } = {},
): BacktestState {
  const [state, setState] = useState<BacktestState>({ result: null, error: null, loading: false });
  // Monotonic id: a slow response from an earlier request must never overwrite a
  // newer one (two fast submits could previously land backwards).
  const latest = useRef(0);
  const key = request ? JSON.stringify(request) : null;
  const retry = opts.retry ?? 0;

  useEffect(() => {
    if (!key || !request) return;
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    void (async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await apiSend<DividendBacktestResult>("/api/tools/dividend-backtest", "POST", request);
        if (latest.current !== id) return; // superseded — drop it
        if (res.ok && res.data) {
          setState({ result: res.data, error: null, loading: false });
          return;
        }
        if (attempt < retry) {
          await sleep(RETRY_DELAY_MS);
          if (latest.current !== id) return;
          continue;
        }
        setState({ result: null, error: res.error ?? "Backtest failed", loading: false });
        return;
      }
    })();
    // `key` is the serialized request; `request` itself is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  return state;
}
