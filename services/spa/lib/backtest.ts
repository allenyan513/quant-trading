/**
 * Shared plumbing for the public dividend backtester: the request shape, the
 * window helpers, and the one hook that talks to the API.
 *
 * Two surfaces consume this — the form tool (`/tools/portfolio-backtest`,
 * which drives everything off the query string) and the preset landing pages
 * (fixed baskets, fetched on mount). Keeping the fetch in ONE hook is what stops
 * those two from drifting into lookalike implementations with different retry,
 * error and race behaviour.
 */
import { useEffect, useRef, useState } from "react";
import { apiSend, type ApiResult } from "@/lib/api-client";
import { annualizedVol, cagr, maxDrawdown, type DividendBacktestResult } from "@qt/shared/backtest";

/** Mirrors the server's limits (`services/data/src/backtest.ts`). */
export const MAX_HOLDINGS = 10;
/** Mirrors the server's cap (`services/data/src/backtest.ts`) — keep them in step. */
export const MAX_YEARS = 20;

/**
 * The window a visitor gets before choosing one — deliberately NOT `MAX_YEARS`.
 * The deepest window is the slowest to fetch and, for a fund that listed in 2011,
 * resolves to the same run as a ten-year one after the engine trims it. Ten is the
 * span most of these funds actually have; twenty is there for the ones that go
 * deeper, on request.
 */
export const DEFAULT_YEARS = 10;

/** Trailing windows offered as one-click chips, shortest first. Every one is ≤
 *  `MAX_YEARS`, and each is a span people search in ("10 years", "20 years"). */
export const WINDOW_PRESETS = [5, 10, 20] as const;

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

/**
 * How much of the total gain came from dividends, 0–1.
 *
 * Uses the NO-DRIP path deliberately: on the DRIP path the income is already
 * inside `endValue`, so dividing one by the other double-counts it.
 *
 * This is the signal that decides whether a page leads with income or with
 * growth — measured, not declared. Real spread at a 10-year window:
 * SCHD 26% / VYM 24% versus SPY 9.7% / QQQ 3.2%, with nothing in between.
 */
export function dividendShare(r: DividendBacktestResult): number {
  const gain = r.noDrip.endValue - r.initial;
  if (gain <= 0) return 0;
  return r.noDrip.totalIncome / gain;
}

/** At or above this, the income tables lead; below it they collapse to one line. */
export const DIVIDEND_LEAD_THRESHOLD = 0.15;

/**
 * What the money went into, in words — "QQQ", "SCHD + VYM", "a 5-holding basket".
 *
 * The results headline used to read `$10,000.00 → $32,496.65`, which is the answer
 * to a question it never asked. Naming the holdings turns it into a sentence
 * someone can read out loud, and it is the one fact the panel was missing.
 *
 * Past three symbols the list stops being readable and starts being a wall, so it
 * collapses to a count — the per-holding table below spells them out anyway.
 */
export function holdingsLabel(symbols: readonly string[]): string {
  const list = symbols.filter(Boolean);
  if (list.length === 0) return "this basket";
  if (list.length <= 3) return list.join(" + ");
  return `a ${list.length}-holding basket`;
}

/**
 * "10 years ago" / "9.9 years ago".
 *
 * Deliberately NOT rounded to the requested window: a twenty-year run on a series
 * that only reaches back 19.9 years is a nineteen-point-nine-year run, and the
 * headline is the last place to round that away.
 */
export function yearsAgoLabel(years: number): string {
  if (!Number.isFinite(years) || years <= 0) return "";
  const rounded = Math.round(years * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} years ago`;
}

/**
 * The headline figures recomputed over a PREFIX of the value path — what the KPI
 * tiles show while the chart is replaying.
 *
 * Reuses the engine's own `cagr` / `maxDrawdown` / `annualizedVol` rather than
 * restating the formulas here, which is what guarantees the replay's final frame
 * lands exactly on the numbers the server already sent. A second implementation
 * that rounded differently would make every replay end on a visible twitch.
 *
 * `@qt/shared/backtest` is the pure engine module — no db, no config — so it is
 * safe in the browser bundle.
 *
 * NOTE the two income figures (dividends collected, yield on cost) are absent and
 * cannot be added here: a series point carries `{date, drip, noDrip}` only, and
 * `noDrip = price-only path + cumulative income` is one equation in two unknowns.
 * Animating those needs the engine to emit a per-day income figure.
 */
export interface WindowStats {
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  volatilityPct: number;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string): number =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

export function statsThrough(
  series: readonly { date: string; value: number }[],
  initial: number,
  through: number,
): WindowStats | null {
  const end = Math.min(through, series.length - 1);
  if (!(initial > 0) || end < 1) return null;
  const values: number[] = [];
  for (let i = 0; i <= end; i++) values.push(series[i]!.value);
  const endValue = values[values.length - 1]!;
  const days = daysBetween(series[0]!.date, series[end]!.date);
  return {
    totalReturnPct: (endValue / initial - 1) * 100,
    cagrPct: cagr(initial, endValue, days) * 100,
    maxDrawdownPct: maxDrawdown(values) * 100,
    volatilityPct: annualizedVol(values) * 100,
  };
}

/**
 * In-flight + completed request cache, keyed by the serialized request.
 *
 * Preset pages now fire one leg per holding PLUS a benchmark leg, so a visitor
 * clicking through a few of them would otherwise burn through the gateway's
 * 20-requests-per-minute-per-IP budget on work we already did — the SPY benchmark
 * for a 10-year window is byte-identical across every page that uses it.
 * Session-scoped and deliberately unbounded-but-small: a session cannot generate
 * many distinct windows.
 */
const cache = new Map<string, Promise<ApiResult<DividendBacktestResult>>>();

function runCached(key: string, request: DividendBacktestRequest): Promise<ApiResult<DividendBacktestResult>> {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = apiSend<DividendBacktestResult>("/api/tools/dividend-backtest", "POST", request);
  cache.set(key, p);
  // A failure must not be cached — the next attempt (or a retry) should really retry.
  void p.then((r) => {
    if (!r.ok) cache.delete(key);
  });
  return p;
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
        const res = await runCached(key, request);
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

/**
 * Run SEVERAL backtests in parallel — one per fund on a comparison page.
 *
 * A comparison page asks "SCHD vs VYM", which is a question about the two funds,
 * not about a blend of them: the API returns one blended curve per request, so
 * getting a line per fund means one request per fund.
 *
 * Fails as a unit: if any leg fails the page shows an error rather than half a
 * comparison, which would silently be a different chart than the title promises.
 */
export function useDividendBacktests(
  requests: DividendBacktestRequest[] | null,
  opts: { retry?: number } = {},
): { results: DividendBacktestResult[] | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{
    results: DividendBacktestResult[] | null;
    error: string | null;
    loading: boolean;
  }>({ results: null, error: null, loading: false });
  const latest = useRef(0);
  const key = requests ? JSON.stringify(requests) : null;
  const retry = opts.retry ?? 0;

  useEffect(() => {
    if (!key || !requests?.length) return;
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    void (async () => {
      const runOne = async (req: DividendBacktestRequest) => {
        for (let attempt = 0; ; attempt++) {
          const res = await runCached(JSON.stringify(req), req);
          if (res.ok && res.data) return { ok: true as const, data: res.data };
          if (attempt < retry) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          return { ok: false as const, error: res.error ?? "Backtest failed" };
        }
      };
      const settled = await Promise.all(requests.map(runOne));
      if (latest.current !== id) return; // superseded — drop it
      const failed = settled.find((r) => !r.ok);
      if (failed && !failed.ok) {
        setState({ results: null, error: failed.error, loading: false });
        return;
      }
      setState({ results: settled.map((r) => (r.ok ? r.data : null)).filter(Boolean) as DividendBacktestResult[], error: null, loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  return state;
}
