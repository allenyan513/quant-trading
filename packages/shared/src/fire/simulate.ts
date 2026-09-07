/**
 * Financial Independence (FI) calculator — pure simulation utilities.
 *
 * All functions here are deterministic given the same RNG. The RNG defaults to
 * `Math.random` but can be injected for reproducible tests.
 *
 * Time conventions:
 *   - Returns and inflation are passed as annual rates (e.g. 0.10 = 10%).
 *   - Internally compounded monthly.
 *   - Volatility (`vol`) is annualized standard deviation of returns.
 *
 * Money conventions:
 *   - All balances and contributions are nominal dollars.
 *   - `targetToday` is the desired monthly spend in *today's* purchasing power
 *     and is grown by inflation each month inside the simulation.
 *   - The FI threshold is `target_nominal × 12 × (1/swr)`.
 */

/** Hard cap on the deterministic accumulation horizon — anyone needing more
 *  than this many years to reach FI effectively can't with the given inputs. */
const MAX_SIM_YEARS = 80;

export type Rng = () => number;

/** Standard normal sample via Box-Muller. */
export const gaussian = (rand: Rng = Math.random): number => {
  let u1 = rand();
  while (u1 < 1e-10) u1 = rand();
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

/** Linear-interpolated percentile of a *sorted* (asc) array. p in [0, 1]. */
export const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const loIdx = Math.floor(idx);
  const lo = sorted[loIdx];
  const hi = sorted[Math.ceil(idx)];
  // Both indices are inside [0, length-1] by construction; the guard is for the
  // compiler, which cannot see that, and costs nothing at runtime.
  if (lo === undefined || hi === undefined) return null;
  return lo + (hi - lo) * (idx - loIdx);
};

export interface DetResult {
  reached: boolean;
  fiMult: number;
  years?: number;
  finalBalance?: number;
  finalMonthlyNominal?: number;
  totalContributed?: number;
}

/**
 * Deterministic accumulation: constant `r` annual return, monthly contributions.
 * Returns the time to reach FI under the SWR rule, or `reached: false` if the
 * target isn't hit within 80 years.
 */
export const simulateDet = (
  P0: number,
  monthly: number,
  targetToday: number,
  r: number,
  swr: number,
  inflation: number,
): DetResult => {
  const mr = Math.pow(1 + r, 1 / 12) - 1;
  const mi = Math.pow(1 + inflation, 1 / 12) - 1;
  const fiMult = 1 / swr;

  let balance = P0;
  let targetNom = targetToday;

  if (P0 >= targetToday * 12 * fiMult) {
    return { reached: true, years: 0, finalBalance: P0, fiMult };
  }

  let months = 0;
  while (months < 12 * MAX_SIM_YEARS) {
    balance = balance * (1 + mr) + monthly;
    targetNom = targetNom * (1 + mi);
    months++;
    if (balance >= targetNom * 12 * fiMult) {
      return {
        reached: true,
        years: months / 12,
        finalBalance: balance,
        finalMonthlyNominal: targetNom,
        totalContributed: P0 + monthly * months,
        fiMult,
      };
    }
  }
  return { reached: false, fiMult };
};

export interface FanPoint {
  year: number;
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  target: number | null;
}

export interface MCResult {
  yearsToFI: number[];
  failures: number;
  nSims: number;
  fanData: FanPoint[];
  successRate: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

/**
 * Monte Carlo accumulation phase. Samples monthly returns IID-normal with the
 * given mean & vol, accumulates with monthly contributions, and records:
 *   - per-sim time to reach FI (if it does within `maxYears`)
 *   - per-year balance percentiles for fan-chart rendering
 */
export const runMC = (
  P0: number,
  monthly: number,
  targetToday: number,
  mean: number,
  vol: number,
  swr: number,
  inflation: number,
  nSims = 1000,
  maxYears = 60,
  rand: Rng = Math.random,
): MCResult => {
  const monthlyMean = Math.pow(1 + mean, 1 / 12) - 1;
  const monthlyVol = vol / Math.sqrt(12);
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;
  const fiMult = 1 / swr;

  const yearsToFI: number[] = [];
  let failures = 0;
  const yearlyBalances: number[][] = Array.from({ length: maxYears + 1 }, () => []);
  const yearlyTargets: number[][] = Array.from({ length: maxYears + 1 }, () => []);

  for (let sim = 0; sim < nSims; sim++) {
    let balance = P0;
    let target = targetToday;
    let reachedAt: number | null = null;

    yearlyBalances[0]?.push(balance);
    yearlyTargets[0]?.push(target * 12 * fiMult);

    for (let m = 0; m < maxYears * 12; m++) {
      const z = gaussian(rand);
      const ret = monthlyMean + monthlyVol * z;
      balance = balance * (1 + ret) + monthly;
      target = target * (1 + monthlyInfl);

      if (reachedAt === null && balance >= target * 12 * fiMult) {
        reachedAt = (m + 1) / 12;
      }

      if ((m + 1) % 12 === 0) {
        const yr = (m + 1) / 12;
        yearlyBalances[yr]?.push(Math.max(0, balance));
        yearlyTargets[yr]?.push(target * 12 * fiMult);
      }
    }

    if (reachedAt !== null) yearsToFI.push(reachedAt);
    else failures++;
  }

  const fanData: FanPoint[] = yearlyBalances.map((balances, yr) => {
    const sorted = [...balances].sort((a, b) => a - b);
    const sortedTargets = [...(yearlyTargets[yr] ?? [])].sort((a, b) => a - b);
    return {
      year: yr,
      p5: percentile(sorted, 0.05),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.50),
      p75: percentile(sorted, 0.75),
      p95: percentile(sorted, 0.95),
      target: percentile(sortedTargets, 0.50),
    };
  });

  yearsToFI.sort((a, b) => a - b);

  return {
    yearsToFI,
    failures,
    nSims,
    fanData,
    successRate: yearsToFI.length / nSims,
    p10: percentile(yearsToFI, 0.10),
    p25: percentile(yearsToFI, 0.25),
    p50: percentile(yearsToFI, 0.50),
    p75: percentile(yearsToFI, 0.75),
    p90: percentile(yearsToFI, 0.90),
  };
};

export interface WithdrawalResult {
  successRate: number;
  bustRate: number;
}

/**
 * Withdrawal phase MC. Tests whether a starting balance survives `years` of
 * inflation-adjusted withdrawals under random monthly returns. A "bust" is any
 * path where the balance goes negative before the horizon.
 */
export const runWithdrawalMC = (
  startBalance: number,
  annualWithdraw: number,
  mean: number,
  vol: number,
  inflation: number,
  nSims = 1000,
  years = 30,
  rand: Rng = Math.random,
): WithdrawalResult => {
  const monthlyMean = Math.pow(1 + mean, 1 / 12) - 1;
  const monthlyVol = vol / Math.sqrt(12);
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;

  let successes = 0;

  for (let sim = 0; sim < nSims; sim++) {
    let balance = startBalance;
    let monthlyW = annualWithdraw / 12;
    let busted = false;

    for (let m = 0; m < years * 12; m++) {
      const z = gaussian(rand);
      const ret = monthlyMean + monthlyVol * z;
      balance = (balance - monthlyW) * (1 + ret);
      monthlyW = monthlyW * (1 + monthlyInfl);
      if (balance < 0) {
        busted = true;
        break;
      }
    }

    if (!busted) successes++;
  }

  return {
    successRate: successes / nSims,
    bustRate: 1 - successes / nSims,
  };
};

export interface HistogramBin {
  binCenter: number;
  binStart: number;
  count: number;
}

/** Build equal-width histogram bins from a *sorted* (asc) array. */
export const histogram = (sortedVals: number[], nBins = 20): HistogramBin[] => {
  const min = sortedVals[0];
  const max = sortedVals[sortedVals.length - 1];
  if (min === undefined || max === undefined) return [];
  const binW = (max - min) / nBins || 1;
  const bins: HistogramBin[] = Array.from({ length: nBins }, (_, i) => ({
    binCenter: min + (i + 0.5) * binW,
    binStart: min + i * binW,
    count: 0,
  }));
  for (const v of sortedVals) {
    const idx = Math.min(Math.floor((v - min) / binW), nBins - 1);
    const bin = bins[idx];
    if (bin) bin.count++;
  }
  return bins;
};
