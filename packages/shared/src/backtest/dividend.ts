/**
 * Deterministic buy-and-hold dividend backtest engine — pure functions, no I/O.
 *
 * Runs TWO accounts over the same daily price/dividend history so the headline
 * question ("what did reinvesting actually buy me?") is answered in one pass:
 *  - DRIP: every dividend buys more shares at that day's close.
 *  - No DRIP: dividends pile up as idle cash (no interest, no reinvestment).
 *
 * Price convention (see `marketdata/records.ts` for the fetch side): FMP's EOD
 * `close` is SPLIT-adjusted but NOT dividend-adjusted, and dividend rows carry a
 * matching split-adjusted `adjDividend`. Pairing those two is what keeps share
 * counts honest across splits without double-counting dividends — never feed a
 * dividend-adjusted (total-return) price series in here.
 *
 * No rebalancing: weights set the opening trade and then drift, which is what
 * someone who bought a dividend basket and held actually experienced.
 */

export interface BacktestBar {
  /** YYYY-MM-DD */
  date: string;
  /** Split-adjusted close. */
  close: number;
}

export interface BacktestDividend {
  /** Ex-dividend date, YYYY-MM-DD. */
  exDate: string;
  /** Split-adjusted per-share cash amount. */
  amount: number;
}

export interface BacktestHoldingInput {
  symbol: string;
  /** Relative weight; normalized across holdings (they need not sum to 100). */
  weight: number;
  /** Daily bars, any order — sorted internally. */
  bars: BacktestBar[];
  dividends: BacktestDividend[];
}

export interface DividendBacktestInput {
  holdings: BacktestHoldingInput[];
  /** Opening investment in account currency. */
  initial: number;
  /** Requested window, YYYY-MM-DD. Clamped to the data actually available. */
  from: string;
  to: string;
  /** Which path is the headline one (both are always computed). */
  reinvest: boolean;
}

export interface PathStats {
  endValue: number;
  /** Idle dividend cash at the end (0 on the DRIP path). */
  endCash: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  /** Annualized stdev of daily returns. */
  volatilityPct: number;
  /** Gross dividends received over the window. */
  totalIncome: number;
}

export interface SeriesPoint {
  date: string;
  drip: number;
  noDrip: number;
}

export interface YearIncome {
  year: number;
  income: number;
  /** Income that year over the ORIGINAL cost basis. */
  yieldOnCostPct: number;
  /** vs the prior year; null for the first year or a partial neighbour. */
  growthPct: number | null;
  /** True when the calendar year is not fully inside the window (first/last). */
  partial: boolean;
}

export interface HoldingResult {
  symbol: string;
  weightPct: number;
  startValue: number;
  endValue: number;
  /** Shares at the end (DRIP path) — grows with reinvestment. */
  endShares: number;
  totalIncome: number;
  totalReturnPct: number;
  /** Latest trailing-12m dividend PER SHARE over the entry price — the classic
   *  "yield on cost". Portfolio-level `yieldOnCostPct` is income over the original
   *  capital instead, so under DRIP it also carries the share growth. */
  perShareYieldOnCostPct: number;
}

export interface DividendCut {
  symbol: string;
  year: number;
  /** Total per-share paid that year (0 for a full suspension). */
  perShare: number;
  priorPerShare: number;
  /** Change in the annual total per share (a cut must also shrink the average
   *  payment to be reported at all — see findDividendCuts). */
  changePct: number;
}

export interface DividendBacktestResult {
  start: string;
  end: string;
  initial: number;
  reinvest: boolean;
  years: number;
  series: SeriesPoint[];
  drip: PathStats;
  noDrip: PathStats;
  /** Income of the SELECTED path (reinvested income compounds, so it differs). */
  incomeByYear: YearIncome[];
  holdings: HoldingResult[];
  /** Trailing-12m income over the ORIGINAL capital. Under DRIP this compounds
   *  (more shares each year), so it runs ahead of any single holding's per-share
   *  yield on cost. */
  yieldOnCostPct: number;
  /** Income CAGR across the full calendar years only; null if under two of them. */
  incomeCagrPct: number | null;
  dividendCuts: DividendCut[];
  /** Human-readable notes (window clamped, symbol short on history, …). */
  warnings: string[];
}

export class BacktestError extends Error {}

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;

const daysBetween = (a: string, b: string): number =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

const yearOf = (d: string): number => Number(d.slice(0, 4));

const pct = (x: number): number => x * 100;

/** Compounded annual growth; falls back to the simple return under a year. */
export function cagr(startValue: number, endValue: number, days: number): number {
  if (startValue <= 0 || days <= 0) return 0;
  const years = days / YEAR_DAYS;
  if (years < 1) return endValue / startValue - 1;
  return (endValue / startValue) ** (1 / years) - 1;
}

/** Deepest peak-to-trough decline of a value series, as a positive fraction. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = 1 - v / peak;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

/** Annualized stdev (sample) of day-over-day simple returns. */
export function annualizedVol(values: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    if (prev > 0) rets.push(values[i]! / prev - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

interface PreparedHolding {
  symbol: string;
  weight: number;
  bars: BacktestBar[];
  /** Bar index → dividends whose ex-date lands on (or just before) that bar. */
  dividends: BacktestDividend[];
}

/** Sort, de-duplicate and range-clamp one holding's inputs. */
function prepare(h: BacktestHoldingInput, from: string, to: string): PreparedHolding {
  const seen = new Set<string>();
  const bars = h.bars
    .filter((b) => b.date >= from && b.date <= to && Number.isFinite(b.close) && b.close > 0)
    .filter((b) => (seen.has(b.date) ? false : (seen.add(b.date), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const divSeen = new Set<string>();
  const dividends = h.dividends
    .filter((d) => Number.isFinite(d.amount) && d.amount > 0)
    .filter((d) => (divSeen.has(d.exDate) ? false : (divSeen.add(d.exDate), true)))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  return { symbol: h.symbol.toUpperCase(), weight: h.weight, bars, dividends };
}

/**
 * Run the backtest. Throws `BacktestError` on inputs that can't produce a
 * meaningful window (no overlapping history, all-zero weights, …).
 */
export function runDividendBacktest(input: DividendBacktestInput): DividendBacktestResult {
  const { initial, from, to, reinvest } = input;
  if (!input.holdings.length) throw new BacktestError("no holdings");
  if (!(initial > 0)) throw new BacktestError("initial investment must be positive");
  if (from >= to) throw new BacktestError("start date must be before end date");

  const warnings: string[] = [];
  const prepared = input.holdings.map((h) => prepare(h, from, to));

  const empty = prepared.filter((h) => h.bars.length === 0);
  if (empty.length) throw new BacktestError(`no price history in range for ${empty.map((h) => h.symbol).join(", ")}`);

  const weightSum = prepared.reduce((a, h) => a + Math.max(0, h.weight), 0);
  if (!(weightSum > 0)) throw new BacktestError("weights must sum to more than zero");

  // The window is the intersection of every holding's history: a basket can only
  // be tested over the period all of its members actually traded.
  const start = prepared.reduce((acc, h) => (h.bars[0]!.date > acc ? h.bars[0]!.date : acc), from);
  const end = prepared.reduce((acc, h) => (h.bars.at(-1)!.date < acc ? h.bars.at(-1)!.date : acc), to);
  if (start >= end) throw new BacktestError("holdings have no overlapping price history in this range");
  // Only flag a MATERIAL gap: every window is a few days short of its requested
  // edges (weekends, the last close), and warning about that trains people to
  // ignore the warnings that matter — a fund that only launched mid-window.
  const GAP_DAYS = 7;
  for (const h of prepared) {
    const first = h.bars[0]!.date;
    const last = h.bars.at(-1)!.date;
    if (daysBetween(from, first) > GAP_DAYS) warnings.push(`${h.symbol} price history only starts ${first}.`);
    if (daysBetween(last, to) > GAP_DAYS) warnings.push(`${h.symbol} price history ends ${last}.`);
  }
  if (daysBetween(from, start) > GAP_DAYS) {
    warnings.push(`Window starts ${start} — the earliest date every holding had prices.`);
  }

  // Shared date axis: the union of trading days across holdings inside the window.
  // A holding missing a day carries its previous close forward (halts, odd feeds).
  const axis = [...new Set(prepared.flatMap((h) => h.bars.map((b) => b.date)))]
    .filter((d) => d >= start && d <= end)
    .sort();

  // Per-holding accounting. `close` is looked up per axis date via a cursor.
  interface Account {
    h: PreparedHolding;
    weight: number;
    dripShares: number;
    plainShares: number;
    startPrice: number;
    startValue: number;
    dripIncome: number;
    plainIncome: number;
    lastClose: number;
  }
  const priceAt = new Map<string, Map<string, number>>();
  for (const h of prepared) priceAt.set(h.symbol, new Map(h.bars.map((b) => [b.date, b.close])));

  const accounts: Account[] = prepared.map((h) => {
    const startPrice = priceAt.get(h.symbol)!.get(start) ?? h.bars.find((b) => b.date >= start)!.close;
    const weight = Math.max(0, h.weight) / weightSum;
    const alloc = initial * weight;
    return {
      h,
      weight,
      dripShares: alloc / startPrice,
      plainShares: alloc / startPrice,
      startPrice,
      startValue: alloc,
      dripIncome: 0,
      plainIncome: 0,
      lastClose: startPrice,
    };
  });

  // Ex-date → axis date it settles on (the first trading day at or after it), so a
  // dividend whose ex-date falls on a holiday still lands exactly once.
  const dividendsOnDate = new Map<string, { acc: Account; amount: number }[]>();
  for (const acc of accounts) {
    for (const d of acc.h.dividends) {
      if (d.exDate <= start || d.exDate > end) continue;
      const settle = axis.find((x) => x >= d.exDate);
      if (!settle) continue;
      const list = dividendsOnDate.get(settle) ?? [];
      list.push({ acc, amount: d.amount });
      dividendsOnDate.set(settle, list);
    }
  }

  const series: SeriesPoint[] = [];
  const dripYear = new Map<number, number>();
  const plainYear = new Map<number, number>();
  let plainCash = 0;
  let dripIncomeTotal = 0;
  let plainIncomeTotal = 0;
  // Trailing-12m income over the ORIGINAL cost — the "yield on cost" a holder
  // quotes. Accumulated as it is paid (shares grow under DRIP, so applying the
  // final share count to past payments would overstate it).
  const ttmFrom = new Date(Date.parse(`${end}T00:00:00Z`) - YEAR_DAYS * DAY_MS).toISOString().slice(0, 10);
  let ttmIncome = 0;

  for (const date of axis) {
    for (const acc of accounts) {
      const close = priceAt.get(acc.h.symbol)!.get(date);
      if (close != null) acc.lastClose = close;
    }
    // Pay dividends at the day's close, then mark the book — DRIP buys at that
    // same close (a same-day fill is the standard simplification).
    for (const { acc, amount } of dividendsOnDate.get(date) ?? []) {
      const dripCash = acc.dripShares * amount;
      const plainPaid = acc.plainShares * amount;
      acc.dripIncome += dripCash;
      acc.plainIncome += plainPaid;
      dripIncomeTotal += dripCash;
      plainIncomeTotal += plainPaid;
      const y = yearOf(date);
      dripYear.set(y, (dripYear.get(y) ?? 0) + dripCash);
      plainYear.set(y, (plainYear.get(y) ?? 0) + plainPaid);
      if (date > ttmFrom) ttmIncome += reinvest ? dripCash : plainPaid;
      if (acc.lastClose > 0) acc.dripShares += dripCash / acc.lastClose;
      plainCash += plainPaid;
    }
    let drip = 0;
    let plain = plainCash;
    for (const acc of accounts) {
      drip += acc.dripShares * acc.lastClose;
      plain += acc.plainShares * acc.lastClose;
    }
    series.push({ date, drip, noDrip: plain });
  }

  const days = daysBetween(start, end);
  const dripValues = series.map((p) => p.drip);
  const plainValues = series.map((p) => p.noDrip);
  const stats = (values: number[], income: number, cash: number): PathStats => {
    const endValue = values.at(-1) ?? initial;
    return {
      endValue,
      endCash: cash,
      totalReturnPct: pct(endValue / initial - 1),
      cagrPct: pct(cagr(initial, endValue, days)),
      maxDrawdownPct: pct(maxDrawdown(values)),
      volatilityPct: pct(annualizedVol(values)),
      totalIncome: income,
    };
  };

  const holdings: HoldingResult[] = accounts.map((acc) => {
    const ttmPerShare = acc.h.dividends
      .filter((d) => d.exDate > ttmFrom && d.exDate <= end)
      .reduce((a, d) => a + d.amount, 0);
    // Follow the selected path: under DRIP the income is already inside the share
    // count; without it the cash sits beside the position, so add it back to make
    // the two total-return figures comparable.
    const shares = reinvest ? acc.dripShares : acc.plainShares;
    const income = reinvest ? acc.dripIncome : acc.plainIncome;
    const endValue = shares * acc.lastClose + (reinvest ? 0 : income);
    return {
      symbol: acc.h.symbol,
      weightPct: pct(acc.weight),
      startValue: acc.startValue,
      endValue,
      endShares: shares,
      totalIncome: income,
      totalReturnPct: pct(endValue / acc.startValue - 1),
      perShareYieldOnCostPct: pct(ttmPerShare / acc.startPrice),
    };
  });

  const selectedYear = reinvest ? dripYear : plainYear;
  const startYear = yearOf(start);
  const endYear = yearOf(end);
  const incomeByYear: YearIncome[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const income = selectedYear.get(y) ?? 0;
    const partial = (y === startYear && start.slice(5) !== "01-01") || (y === endYear && end.slice(5) !== "12-31");
    const prior = incomeByYear.at(-1);
    const growthPct = prior && !prior.partial && !partial && prior.income > 0 ? pct(income / prior.income - 1) : null;
    incomeByYear.push({ year: y, income, yieldOnCostPct: pct(income / initial), growthPct, partial });
  }

  const fullYears = incomeByYear.filter((y) => !y.partial && y.income > 0);
  const firstFull = fullYears[0];
  const lastFull = fullYears.at(-1);
  const incomeCagrPct =
    firstFull && lastFull && lastFull.year > firstFull.year
      ? pct((lastFull.income / firstFull.income) ** (1 / (lastFull.year - firstFull.year)) - 1)
      : null;

  return {
    start,
    end,
    initial,
    reinvest,
    years: days / YEAR_DAYS,
    series,
    drip: stats(dripValues, dripIncomeTotal, 0),
    noDrip: stats(plainValues, plainIncomeTotal, plainCash),
    incomeByYear,
    holdings,
    yieldOnCostPct: pct(ttmIncome / initial),
    incomeCagrPct,
    dividendCuts: findDividendCuts(prepared, start, end),
    warnings,
  };
}

/**
 * Dividend cuts per FULL calendar year, per symbol.
 *
 * A year is a cut only when BOTH the annual total per share AND the average
 * payment per ex-date fell. Either test alone produces false alarms on real
 * payers, in opposite directions:
 *  - totals alone: a monthly payer fits 13 ex-dates into one calendar year and 12
 *    into the next, so a raising REIT (Realty Income 2024) reads as a 6% cut.
 *  - averages alone: a BDC that adds supplemental payouts (Main Street 2022) pays
 *    MORE in total across more, smaller cheques, and reads as a 7% cut.
 * Requiring both keeps the genuine ones (AT&T 2022, JEPI 2023) and drops the rest.
 * A year that pays nothing after a paying year is reported as a full suspension.
 * Partial first/last years are excluded — the window clipped them.
 */
export function findDividendCuts(
  holdings: Array<{ symbol: string; dividends: BacktestDividend[] }>,
  start: string,
  end: string,
): DividendCut[] {
  const cuts: DividendCut[] = [];
  const firstFull = start.slice(5) === "01-01" ? yearOf(start) : yearOf(start) + 1;
  const lastFull = end.slice(5) === "12-31" ? yearOf(end) : yearOf(end) - 1;
  for (const h of holdings) {
    const byYear = new Map<number, { total: number; count: number }>();
    for (const d of h.dividends) {
      const y = yearOf(d.exDate);
      if (y < firstFull || y > lastFull) continue;
      const cur = byYear.get(y) ?? { total: 0, count: 0 };
      byYear.set(y, { total: cur.total + d.amount, count: cur.count + 1 });
    }
    let paidBefore = false;
    for (let y = firstFull + 1; y <= lastFull; y++) {
      const cur = byYear.get(y);
      const prior = byYear.get(y - 1);
      if (prior && prior.count > 0) paidBefore = true;
      if (!prior || prior.count === 0) continue;
      if (!cur || cur.count === 0) {
        if (paidBefore) cuts.push({ symbol: h.symbol, year: y, perShare: 0, priorPerShare: prior.total, changePct: -100 });
        continue;
      }
      const totalChange = cur.total / prior.total - 1;
      const avgChange = cur.total / cur.count / (prior.total / prior.count) - 1;
      if (totalChange < -0.01 && avgChange < -0.01) {
        cuts.push({ symbol: h.symbol, year: y, perShare: cur.total, priorPerShare: prior.total, changePct: pct(totalChange) });
      }
    }
  }
  return cuts;
}
