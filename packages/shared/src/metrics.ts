// ============================================================
// Performance metrics — pure TypeScript, no I/O (ported from legends/value-scope).
//
// Conventions:
//   - Daily returns are decimals: 0.01 = +1%.
//   - Annualization factor = 252 trading days.
//   - Risk-free rate is an annualized decimal (e.g. 0.045 for 4.5%);
//     daily RF = riskFreeAnnualized / 252.
//   - NAV index is unitless (base=100 at inception by convention).
//   - Functions return `null` when the input is too short for the stat to be
//     meaningful, so callers can render a "not enough history yet" state.
// ============================================================

const MIN_DAYS_FOR_ANNUALIZED_METRICS = 63;
const MIN_DAYS_FOR_CAGR = 20;
const TRADING_DAYS_PER_YEAR = 252;

export interface DailyReturn {
  date: string;
  r: number;
}

export interface DrawdownResult {
  /** Max drawdown as a NEGATIVE decimal (e.g. -0.1818 for an 18.18% fall). */
  maxDD: number;
  peakDate: string;
  troughDate: string;
  /** First date after the trough where NAV recovered to the peak (null if not yet). */
  recoveredDate: string | null;
}

/** Arithmetic mean of an array. 0 for empty. */
function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample stdev (n-1 denominator). null if < 2 elements. */
function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let s2 = 0;
  for (const x of xs) {
    const d = x - m;
    s2 += d * d;
  }
  return Math.sqrt(s2 / (xs.length - 1));
}

/** Covariance (n-1 denominator). null if lengths differ or < 2 points. */
function covariance(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i]! - mx) * (ys[i]! - my);
  return s / (xs.length - 1);
}

/**
 * CAGR from an endpoint NAV index (base=100 at inception). years is derived from
 * trading-day count. Returns null below MIN_DAYS_FOR_CAGR (meaningless on < 1mo).
 */
export function cagr(startIndex: number, endIndex: number, tradingDays: number): number | null {
  if (tradingDays < MIN_DAYS_FOR_CAGR) return null;
  if (startIndex <= 0 || endIndex <= 0) return null;
  const years = tradingDays / TRADING_DAYS_PER_YEAR;
  return Math.pow(endIndex / startIndex, 1 / years) - 1;
}

/** Annualized arithmetic mean of daily returns. */
export function annualizedReturn(returns: readonly DailyReturn[]): number | null {
  if (returns.length === 0) return null;
  return mean(returns.map((r) => r.r)) * TRADING_DAYS_PER_YEAR;
}

/** Annualized volatility = sample stdev × sqrt(252). null below the min-history gate. */
export function annualizedVolatility(returns: readonly DailyReturn[]): number | null {
  if (returns.length < MIN_DAYS_FOR_ANNUALIZED_METRICS) return null;
  const sd = stdev(returns.map((r) => r.r));
  if (sd == null) return null;
  return sd * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Annualized Sharpe = mean(excess daily) / stdev(excess daily) × sqrt(252). */
export function sharpe(returns: readonly DailyReturn[], riskFreeAnnualized: number): number | null {
  if (returns.length < MIN_DAYS_FOR_ANNUALIZED_METRICS) return null;
  const rfDaily = riskFreeAnnualized / TRADING_DAYS_PER_YEAR;
  const excess = returns.map((r) => r.r - rfDaily);
  const sd = stdev(excess);
  if (sd == null || sd === 0) return null;
  return (mean(excess) / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Annualized Sortino — like Sharpe but divides by downside deviation. */
export function sortino(returns: readonly DailyReturn[], riskFreeAnnualized: number): number | null {
  if (returns.length < MIN_DAYS_FOR_ANNUALIZED_METRICS) return null;
  const rfDaily = riskFreeAnnualized / TRADING_DAYS_PER_YEAR;
  const excess = returns.map((r) => r.r - rfDaily);
  const downside = excess.map((e) => (e < 0 ? e * e : 0));
  const dd = Math.sqrt(mean(downside));
  if (dd === 0) return null;
  return (mean(excess) / dd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Max drawdown over a date-ASC NAV index series. null if < 2 points. */
export function maxDrawdown(series: ReadonlyArray<{ date: string; nav: number }>): DrawdownResult | null {
  if (series.length < 2) return null;
  let peak = series[0]!.nav;
  let peakDate = series[0]!.date;
  let troughValue = peak;
  let troughDate = peakDate;
  let maxDD = 0;
  let bestPeakDate = peakDate;
  let bestTroughDate = troughDate;

  for (const row of series) {
    if (row.nav > peak) {
      peak = row.nav;
      peakDate = row.date;
      troughValue = peak;
      troughDate = row.date;
    } else if (row.nav < troughValue) {
      troughValue = row.nav;
      troughDate = row.date;
      const dd = row.nav / peak - 1; // negative
      if (dd < maxDD) {
        maxDD = dd;
        bestPeakDate = peakDate;
        bestTroughDate = troughDate;
      }
    }
  }

  const peakValueAtBest = series.find((r) => r.date === bestPeakDate)?.nav ?? peak;
  let recoveredDate: string | null = null;
  for (const row of series) {
    if (row.date > bestTroughDate && row.nav >= peakValueAtBest) {
      recoveredDate = row.date;
      break;
    }
  }

  return { maxDD, peakDate: bestPeakDate, troughDate: bestTroughDate, recoveredDate };
}

/** Calmar = CAGR / |MaxDD| over the same NAV index series. */
export function calmar(series: ReadonlyArray<{ date: string; nav: number }>): number | null {
  if (series.length < 2) return null;
  const start = series[0]!;
  const end = series[series.length - 1]!;
  const c = cagr(start.nav, end.nav, series.length);
  const dd = maxDrawdown(series);
  if (c == null || dd == null || dd.maxDD === 0) return null;
  return c / Math.abs(dd.maxDD);
}

/**
 * Intersect two daily-return series by date. Inputs may be unsorted / have gaps;
 * output is ascending-by-date and keeps only dates present in both.
 */
export function alignSeries(
  a: readonly DailyReturn[],
  b: readonly DailyReturn[],
): { a: DailyReturn[]; b: DailyReturn[] } {
  const bMap = new Map(b.map((r) => [r.date, r.r]));
  const merged: Array<{ date: string; ra: number; rb: number }> = [];
  for (const row of a) {
    const rb = bMap.get(row.date);
    if (rb !== undefined) merged.push({ date: row.date, ra: row.r, rb });
  }
  merged.sort((x, y) => (x.date < y.date ? -1 : 1));
  return {
    a: merged.map((m) => ({ date: m.date, r: m.ra })),
    b: merged.map((m) => ({ date: m.date, r: m.rb })),
  };
}

/** Beta = cov(portfolio, benchmark) / var(benchmark). Requires aligned series. */
export function beta(portfolio: readonly DailyReturn[], benchmark: readonly DailyReturn[]): number | null {
  if (portfolio.length !== benchmark.length) return null;
  if (portfolio.length < MIN_DAYS_FOR_ANNUALIZED_METRICS) return null;
  const p = portfolio.map((r) => r.r);
  const b = benchmark.map((r) => r.r);
  const cov = covariance(p, b);
  const sdb = stdev(b);
  if (cov == null || sdb == null || sdb === 0) return null;
  return cov / (sdb * sdb);
}

/** Annualized Jensen's alpha: α = R_p − (R_f + β(R_b − R_f)). */
export function alpha(
  portfolio: readonly DailyReturn[],
  benchmark: readonly DailyReturn[],
  riskFreeAnnualized: number,
): number | null {
  const rp = annualizedReturn(portfolio);
  const rb = annualizedReturn(benchmark);
  const b = beta(portfolio, benchmark);
  if (rp == null || rb == null || b == null) return null;
  return rp - (riskFreeAnnualized + b * (rb - riskFreeAnnualized));
}

/** Annualized information ratio: mean(excess vs benchmark) / TE × sqrt(252). */
export function informationRatio(
  portfolio: readonly DailyReturn[],
  benchmark: readonly DailyReturn[],
): number | null {
  if (portfolio.length !== benchmark.length) return null;
  if (portfolio.length < MIN_DAYS_FOR_ANNUALIZED_METRICS) return null;
  const excess = portfolio.map((r, i) => r.r - benchmark[i]!.r);
  const sd = stdev(excess);
  if (sd == null || sd === 0) return null;
  return (mean(excess) / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Treynor ratio = (R_p − R_f) / β, annualized. */
export function treynor(returns: readonly DailyReturn[], riskFreeAnnualized: number, b: number): number | null {
  const r = annualizedReturn(returns);
  if (r == null || b === 0) return null;
  return (r - riskFreeAnnualized) / b;
}

/** Convert a price series to daily returns. Drops the first row (no prior close). */
export function pricesToReturns(prices: ReadonlyArray<{ date: string; close: number }>): DailyReturn[] {
  if (prices.length < 2) return [];
  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: DailyReturn[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.close;
    const cur = sorted[i]!.close;
    if (prev > 0) out.push({ date: sorted[i]!.date, r: cur / prev - 1 });
  }
  return out;
}
