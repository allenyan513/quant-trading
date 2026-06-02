// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// PEG Fair Value Model
//
// Fair Value = (EPS Growth Rate + Dividend Yield) × NTM EPS
//
// Growth priority: forward analyst consensus → historical EPS CAGR
// Includes dividend yield (PEGY variant)
// ============================================================

import type { FinancialStatement, AnalystEstimate, ValuationResult } from "../types.js";
import { cagr, clamp } from "./dcf-helpers.js";

/** Growth rate bounds (PEG methodology) */
const GROWTH_FLOOR = 0.08; // 8% — minimum sensible P/E of 8x
const GROWTH_CEILING = 0.25; // 25% — cap for hypergrowth

export interface PEGInputs {
  historicals: FinancialStatement[];
  currentPrice: number;
  estimates?: AnalystEstimate[];
  marketCap?: number;
}

export type PEGGrowthSource = "forward" | "historical" | "blended";

export interface PEGDetails {
  // Core calculation
  growth_rate: number; // Clamped decimal used for fair value
  raw_growth_rate: number; // Unclamped decimal
  growth_source: PEGGrowthSource;
  dividend_yield: number; // Decimal (e.g., 0.005 for 0.5%)
  adjusted_growth: number; // growth_rate + dividend_yield (before clamp)
  fair_pe: number;
  ttm_eps: number; // Latest annual EPS (actual trailing)
  ntm_eps: number | null; // Next-twelve-month EPS from estimates
  eps_used: number; // The EPS actually used in calculation
  eps_label: string; // "NTM EPS (FY2026)" or "TTM EPS (FY2025)"
  growth_clamped: boolean;
  years_used: number;

  // PEG analysis
  peg_ratio: number | null; // Current P/E ÷ adjusted growth
  current_pe: number | null;

  // Forward growth detail
  forward_growth: number | null; // Forward EPS CAGR
  forward_years: number | null;
  forward_estimates: Array<{
    period: string;
    eps: number;
    growth_pct: number | null;
    analysts: number;
  }>;

  // Historical growth detail
  historical_growth: number | null; // Historical EPS CAGR
  historical_years: number | null;
  earnings_history: Array<{
    year: number;
    net_income: number;
    eps: number;
    yoy_growth: number | null;
  }>;
}

/**
 * Calculate PEG Fair Value.
 *
 * Priority: forward analyst EPS growth → historical EPS CAGR
 * Includes dividend yield (PEGY variant).
 */
export function calculatePEG(inputs: PEGInputs): ValuationResult {
  const { historicals, currentPrice, estimates, marketCap } = inputs;

  // Sort annual financials ascending by year
  const sorted = [...historicals]
    .filter((f) => f.period_type === "annual")
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length < 2) {
    return naResult("Insufficient data — need at least 2 years of financials");
  }

  const latest = sorted[sorted.length - 1];
  const ttmEPS = latest.eps_diluted || latest.eps;

  if (!ttmEPS || ttmEPS <= 0) {
    return naResult("N/A — Negative or zero trailing EPS");
  }

  // --- 1. Compute forward growth from analyst estimates ---
  const forwardResult = computeForwardGrowth(ttmEPS, latest.fiscal_year, estimates);

  // --- 2. Compute historical EPS CAGR (fallback) ---
  const historicalResult = computeHistoricalEPSGrowth(sorted);

  // --- 3. Pick growth source ---
  let rawGrowthRate: number;
  let growthSource: PEGGrowthSource;

  if (forwardResult.growth !== null && forwardResult.years >= 2) {
    // Forward estimates available with enough data points
    rawGrowthRate = forwardResult.growth;
    growthSource = "forward";
  } else if (historicalResult.growth !== null) {
    rawGrowthRate = historicalResult.growth;
    growthSource = "historical";
  } else {
    rawGrowthRate = 0;
    growthSource = "historical";
  }

  // --- 4. Compute dividend yield ---
  const dividendYield = computeDividendYield(latest, marketCap, currentPrice);

  // --- 5. Adjusted growth = EPS growth + dividend yield ---
  const adjustedGrowth = rawGrowthRate + dividendYield;

  // --- 6. Clamp and compute fair value ---
  const clampedGrowth = clamp(adjustedGrowth, GROWTH_FLOOR, GROWTH_CEILING);
  const growthClamped = adjustedGrowth !== clampedGrowth;

  const fairPE = clampedGrowth * 100;

  // Use NTM EPS if forward estimates available, otherwise TTM
  const ntmEPS = forwardResult.ntmEPS;
  const epsUsed = ntmEPS ?? ttmEPS;

  // Guard: EPS too small relative to price (e.g., WBD NTM EPS=$0.02 vs price=$27)
  if (currentPrice > 0 && epsUsed < currentPrice * 0.001) {
    return naResult(`N/A — EPS ($${epsUsed.toFixed(2)}) too small relative to price for PEG`);
  }

  const epsLabel = ntmEPS
    ? `NTM EPS (FY${forwardResult.ntmPeriod})`
    : `TTM EPS (FY${latest.fiscal_year})`;

  const fairValue = fairPE * epsUsed;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // --- 7. PEG ratio ---
  const currentPE = epsUsed > 0 ? currentPrice / epsUsed : null;
  const pegRatio =
    currentPE !== null && adjustedGrowth > 0
      ? currentPE / (adjustedGrowth * 100)
      : null;

  // --- 9. Build earnings history ---
  const earningsHistory = sorted.map((f, i) => ({
    year: f.fiscal_year,
    net_income: f.net_income,
    eps: f.eps_diluted || f.eps,
    yoy_growth:
      i > 0 && sorted[i - 1].eps_diluted > 0
        ? ((f.eps_diluted - sorted[i - 1].eps_diluted) / sorted[i - 1].eps_diluted) * 100
        : null,
  }));

  const details: PEGDetails = {
    growth_rate: clampedGrowth,
    raw_growth_rate: rawGrowthRate,
    growth_source: growthSource,
    dividend_yield: dividendYield,
    adjusted_growth: adjustedGrowth,
    fair_pe: fairPE,
    ttm_eps: ttmEPS,
    ntm_eps: ntmEPS,
    eps_used: epsUsed,
    eps_label: epsLabel,
    growth_clamped: growthClamped,
    years_used: growthSource === "forward"
      ? (forwardResult.years ?? 0)
      : (historicalResult.years ?? 0),
    peg_ratio: pegRatio,
    current_pe: currentPE,
    forward_growth: forwardResult.growth,
    forward_years: forwardResult.years,
    forward_estimates: forwardResult.estimates,
    historical_growth: historicalResult.growth,
    historical_years: historicalResult.years,
    earnings_history: earningsHistory,
  };

  return {
    model_type: "peg",
    fair_value: fairValue,
    upside_percent: upside,
    low_estimate: fairValue,
    high_estimate: fairValue,
    assumptions: {
      earnings_growth_rate: Math.round(clampedGrowth * 10000) / 100,
      raw_growth_rate: Math.round(rawGrowthRate * 10000) / 100,
      dividend_yield: Math.round(dividendYield * 10000) / 100,
      growth_source: growthSource,
      ttm_eps: Math.round(ttmEPS * 100) / 100,
      ntm_eps: ntmEPS ? Math.round(ntmEPS * 100) / 100 : null,
      eps_used: Math.round(epsUsed * 100) / 100,
      years_used: details.years_used,
      growth_rate_clamped: growthClamped,
      peg_ratio: pegRatio ? Math.round(pegRatio * 100) / 100 : null,
    },
    details: details as unknown as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  };
}

// ---- Internal helpers ----

interface ForwardGrowthResult {
  growth: number | null;
  years: number;
  ntmEPS: number | null;
  ntmPeriod: string | null;
  epsLow: number | null;
  epsHigh: number | null;
  estimates: Array<{
    period: string;
    eps: number;
    growth_pct: number | null;
    analysts: number;
  }>;
}

function computeForwardGrowth(
  currentEPS: number,
  currentFiscalYear: number,
  estimates?: AnalystEstimate[]
): ForwardGrowthResult {
  const empty: ForwardGrowthResult = {
    growth: null,
    years: 0,
    ntmEPS: null,
    ntmPeriod: null,
    epsLow: null,
    epsHigh: null,
    estimates: [],
  };

  if (!estimates || estimates.length === 0 || currentEPS <= 0) return empty;

  // Filter to future periods with positive EPS, sorted by period
  const future = estimates
    .filter((e) => {
      const year = parseInt(e.period);
      return year > currentFiscalYear && e.eps_estimate > 0 && e.number_of_analysts >= 3;
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  if (future.length === 0) return empty;

  // NTM EPS = first future estimate
  const ntm = future[0];

  // Build estimate detail list with growth rates
  const estDetails: ForwardGrowthResult["estimates"] = [];
  let prevEPS = currentEPS;
  for (const est of future) {
    const growthPct = prevEPS > 0
      ? ((est.eps_estimate - prevEPS) / prevEPS) * 100
      : null;
    estDetails.push({
      period: est.period,
      eps: est.eps_estimate,
      growth_pct: growthPct,
      analysts: est.number_of_analysts,
    });
    prevEPS = est.eps_estimate;
  }

  // Forward EPS CAGR: from current EPS to furthest estimate
  const furthest = future[future.length - 1];
  const yearsForward = parseInt(furthest.period) - currentFiscalYear;
  const forwardGrowth = yearsForward > 0
    ? cagr(currentEPS, furthest.eps_estimate, yearsForward)
    : null;

  return {
    growth: forwardGrowth,
    years: yearsForward,
    ntmEPS: ntm.eps_estimate,
    ntmPeriod: ntm.period,
    epsLow: ntm.eps_low > 0 ? ntm.eps_low : null,
    epsHigh: ntm.eps_high > 0 ? ntm.eps_high : null,
    estimates: estDetails,
  };
}

interface HistoricalGrowthResult {
  growth: number | null;
  years: number | null;
}

function computeHistoricalEPSGrowth(
  sorted: FinancialStatement[]
): HistoricalGrowthResult {
  if (sorted.length < 2) return { growth: null, years: null };

  // Use EPS CAGR instead of net income CAGR (avoids buyback distortion)
  const yearsAvailable = Math.min(sorted.length - 1, 5);
  const startIdx = sorted.length - 1 - yearsAvailable;
  const startEPS = sorted[startIdx].eps_diluted || sorted[startIdx].eps;
  const endEPS = sorted[sorted.length - 1].eps_diluted || sorted[sorted.length - 1].eps;

  if (startEPS > 0 && endEPS > 0) {
    return {
      growth: cagr(startEPS, endEPS, yearsAvailable),
      years: yearsAvailable,
    };
  }

  // Fallback: average YoY growth of positive EPS pairs
  const yoyGrowths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevEPS = sorted[i - 1].eps_diluted || sorted[i - 1].eps;
    const currEPS = sorted[i].eps_diluted || sorted[i].eps;
    if (prevEPS > 0 && currEPS > 0) {
      yoyGrowths.push((currEPS - prevEPS) / prevEPS);
    }
  }

  return {
    growth: yoyGrowths.length > 0
      ? yoyGrowths.reduce((a, b) => a + b, 0) / yoyGrowths.length
      : 0,
    years: yearsAvailable,
  };
}

function computeDividendYield(
  latest: FinancialStatement,
  marketCap?: number,
  currentPrice?: number
): number {
  // dividends_paid is typically negative in financials (cash outflow)
  const absDividends = Math.abs(latest.dividends_paid || 0);
  if (absDividends === 0) return 0;

  // Prefer market cap, fall back to price × shares
  const cap = marketCap
    || (currentPrice && latest.shares_outstanding
      ? currentPrice * latest.shares_outstanding
      : 0);

  if (cap <= 0) return 0;
  return absDividends / cap;
}

function naResult(note: string): ValuationResult {
  return {
    model_type: "peg",
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}