/**
 * Dividend portfolio backtest — the data-side loader for the public tool.
 *
 * data owns market data (T12), so the read-through fetch lives here and the
 * gateway only forwards. Per symbol we pull split-adjusted daily closes
 * (`data_daily_prices`) plus the dividend record cache (`data_dividends`), hand
 * both to the pure engine in `@qt/shared/backtest`, and return its result. The
 * caches make a repeat run (a shared result link, a tweaked weight) free.
 *
 * The dividend amount deliberately prefers FMP's `adjDividend` — the
 * split-adjusted per-share cash — because the price series is split-adjusted
 * too. Pairing raw `dividend` with adjusted closes would inflate income across
 * any split in the window (AAPL 2020: $0.82 raw vs $0.205 adjusted).
 */
import { marketdata, mapLimit, runDividendBacktest, BacktestError } from "@qt/shared";
import type { BacktestBar, BacktestDividend, DividendBacktestResult } from "@qt/shared";
import { log } from "./log.js";

/** Bounds — a public, unauthenticated endpoint that spends FMP quota. */
export const MAX_HOLDINGS = 10;
/** Twenty, not ten. Ten was set when this was a dividend-only tool and covered the
 *  history most dividend ETFs actually had; generalized to growth names, the windows
 *  people search for ("$10,000 in Apple twenty years ago") sit past that line. */
export const MAX_YEARS = 20;
/**
 * Deep enough for MAX_YEARS plus slack.
 *
 * FMP returns at most 5000 daily bars per request, which is ~19.9 years of trading
 * days — so the very deepest windows can come back a few weeks short. That is safe
 * rather than silent: the engine starts the window at the first date every holding
 * has prices and pushes a "Window starts <date>" warning saying so. Going deeper
 * than one request would mean paginating the shared price fetch, which the whole
 * pipeline uses; not worth it for those few weeks.
 */
const MAX_LOOKBACK_DAYS = 7500;
const DIVIDEND_ROWS = 400;
const FETCH_CONCURRENCY = 3;

export interface BacktestRequestHolding {
  symbol: string;
  weight: number;
}

export interface BacktestRequest {
  holdings: BacktestRequestHolding[];
  from: string;
  to: string;
  initial: number;
  reinvest: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Pure request validation (unit-tested). Throws `BacktestError` with a
 * user-facing message — the endpoint turns that into a 400.
 */
export function parseBacktestRequest(body: Record<string, unknown>): BacktestRequest {
  const raw = Array.isArray(body.holdings) ? body.holdings : [];
  if (!raw.length) throw new BacktestError("at least one holding is required");
  if (raw.length > MAX_HOLDINGS) throw new BacktestError(`at most ${MAX_HOLDINGS} holdings`);

  const seen = new Set<string>();
  const holdings: BacktestRequestHolding[] = raw.map((h) => {
    const rec = (h ?? {}) as Record<string, unknown>;
    const symbol = String(rec.symbol ?? "").trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) throw new BacktestError(`invalid symbol: ${symbol || "(blank)"}`);
    if (seen.has(symbol)) throw new BacktestError(`duplicate symbol: ${symbol}`);
    seen.add(symbol);
    const weight = Number(rec.weight ?? 0);
    if (!Number.isFinite(weight) || weight < 0) throw new BacktestError(`invalid weight for ${symbol}`);
    return { symbol, weight };
  });
  if (!(holdings.reduce((a, h) => a + h.weight, 0) > 0)) throw new BacktestError("weights must sum to more than zero");

  const to = String(body.to ?? "").trim() || today();
  const from = String(body.from ?? "").trim();
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BacktestError("dates must be YYYY-MM-DD");
  if (from >= to) throw new BacktestError("start date must be before end date");
  // Calendar comparison, not a day count: "exactly MAX_YEARS ago" is the tool's own
  // default start, and a day-count cap would reject it on the leap-year rounding.
  const floor = new Date(Date.parse(`${to}T00:00:00Z`));
  floor.setUTCFullYear(floor.getUTCFullYear() - MAX_YEARS);
  if (from < floor.toISOString().slice(0, 10)) throw new BacktestError(`window is capped at ${MAX_YEARS} years`);

  const initial = Number(body.initial ?? 10_000);
  if (!Number.isFinite(initial) || initial <= 0) throw new BacktestError("initial investment must be positive");
  if (initial > 1e12) throw new BacktestError("initial investment is unrealistically large");

  return { holdings, from, to, initial, reinvest: body.reinvest !== false };
}

/** Dividend record row → engine input. `adjDividend` first (see file header). */
export function toDividend(row: { data: unknown }): BacktestDividend | null {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const exDate = typeof d.date === "string" ? d.date.slice(0, 10) : "";
  // FMP fills missing dates with "0000-00-00", which is shaped like a date but is not one.
  if (!DATE_RE.test(exDate) || exDate.startsWith("0000")) return null;
  const adj = typeof d.adjDividend === "number" ? d.adjDividend : null;
  const raw = typeof d.dividend === "number" ? d.dividend : null;
  const amount = adj ?? raw;
  if (amount == null || !(amount > 0)) return null;
  return { exDate, amount };
}

/** Load history for one symbol through the read-through caches. */
async function loadHolding(h: BacktestRequestHolding, from: string) {
  const lookback = Math.min(MAX_LOOKBACK_DAYS, Math.ceil((Date.now() - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 10);
  const [prices, dividends] = await Promise.all([
    // `fetchDays` opts this caller — and only this caller — into a deeper price
    // cache than the news pipeline keeps; without it nothing can reach past ~11y.
    marketdata.getDailyPrices(h.symbol, Math.max(30, lookback), { fetchDays: MAX_LOOKBACK_DAYS }),
    marketdata.getDividends(h.symbol, DIVIDEND_ROWS),
  ]);
  const bars: BacktestBar[] = [];
  for (const p of prices) {
    if (p.close == null || !(p.close > 0)) continue;
    bars.push({ date: p.tradeDate, close: p.close });
  }
  const divs: BacktestDividend[] = [];
  for (const row of dividends) {
    const d = toDividend(row);
    if (d) divs.push(d);
  }
  return { symbol: h.symbol, weight: h.weight, bars, dividends: divs };
}

/** Validate → load → run. Throws `BacktestError` for anything the caller can fix. */
export async function runBacktest(body: Record<string, unknown>): Promise<DividendBacktestResult> {
  const req = parseBacktestRequest(body);
  const holdings = await mapLimit(req.holdings, FETCH_CONCURRENCY, (h) => loadHolding(h, req.from));

  const missing = holdings.filter((h) => h.bars.length === 0).map((h) => h.symbol);
  if (missing.length) throw new BacktestError(`no price history for ${missing.join(", ")}`);

  const result = runDividendBacktest({ ...req, holdings });
  log.info("backtest.dividend", {
    symbols: req.holdings.map((h) => h.symbol).join(","),
    start: result.start,
    end: result.end,
    reinvest: req.reinvest,
  });
  const noIncome = result.holdings.filter((h) => h.totalIncome === 0).map((h) => h.symbol);
  if (noIncome.length) result.warnings.push(`No dividends recorded in this window for ${noIncome.join(", ")}.`);
  return result;
}
