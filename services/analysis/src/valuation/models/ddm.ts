// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Dividend Discount Model (DDM) — Two-Stage
//
// Values a stock as the present value of all future dividends.
// Stage 1: project DPS for 5 years using near-term growth rate
// Stage 2: terminal value via Gordon Growth Model
//
// Key difference from DCF:
//   - Discounts equity cash flows (dividends), not firm cash flows
//   - Uses Cost of Equity (Ke), not WACC
//   - Only applicable to dividend-paying companies
//
// Formula:
//   Fair Value = Σ DPS_t / (1+Ke)^t  +  TV / (1+Ke)^N
//   where TV = DPS_(N+1) / (Ke - g_terminal)
// ============================================================

import type { FinancialStatement, AnalystEstimate, ValuationResult } from "../types.js";
import { cagr, clamp } from "./dcf-helpers.js";
import { formatRatio } from "../format.js";

// --- Constants ---
const PROJECTION_YEARS = 5;
const MIN_DPS_GROWTH = 0.0;   // 0% floor — dividends shouldn't shrink in projection
const MAX_DPS_GROWTH = 0.15;  // 15% ceiling — dividend growth rarely exceeds this
const KE_BAND = 0.02;         // ±2% for sensitivity matrix
const GROWTH_BAND = 0.02;     // ±2% for sensitivity matrix
const SENSITIVITY_STEPS = 5;  // 5×5 matrix
const MIN_YEARS_FOR_CAGR = 3; // Need at least 3 years of DPS history for CAGR

// --- Public types ---

export type DDMGrowthSource = "historical_dps_cagr" | "analyst_eps_cagr" | "blended" | "gdp_fallback";

export interface DDMHistoricalDPS {
  year: number;
  dividends_paid: number;
  shares_outstanding: number;
  dps: number;
  net_income: number;
  payout_ratio: number | null; // null if net_income <= 0
  yoy_growth: number | null;   // null for first year
}

export interface DDMProjectionYear {
  year: number;
  dps: number;
  growth_rate: number;
  discount_factor: number;
  pv: number;
}

export interface DDMDetails {
  // Dividend profile
  current_dps: number;
  dividend_yield: number;
  payout_ratio: number | null;
  fcf_payout_ratio: number | null;
  dividend_coverage: number | null; // net_income / dividends

  // Historical
  historical_dps: DDMHistoricalDPS[];
  dps_cagr: number | null;        // historical DPS CAGR (null if insufficient data)
  dps_cagr_years: number | null;

  // Growth rate selection
  near_term_growth: number;
  growth_source: DDMGrowthSource;
  analyst_eps_growth: number | null;

  // Model parameters
  terminal_growth: number;
  cost_of_equity: number;

  // Projections
  projections: DDMProjectionYear[];
  pv_dividends: number;
  terminal_dps: number;
  terminal_value: number;
  pv_terminal: number;

  // Sensitivity
  sensitivity_matrix: {
    ke_values: number[];
    growth_values: number[];
    prices: number[][];
  };
}

export interface DDMInputs {
  historicals: FinancialStatement[];
  costOfEquity: number;
  terminalGrowthRate: number;
  currentPrice: number;
  sharesOutstanding: number;
  estimates?: AnalystEstimate[];
  marketCap?: number;
}

/**
 * Calculate fair value using the Two-Stage Dividend Discount Model.
 * Returns fair_value === 0 with explanatory note for non-dividend-paying companies.
 */
export function calculateDDM(inputs: DDMInputs): ValuationResult {
  const {
    historicals,
    costOfEquity,
    terminalGrowthRate,
    currentPrice,
    sharesOutstanding,
    estimates,
    marketCap,
  } = inputs;

  // Sort annual financials ascending by year
  const sorted = [...historicals]
    .filter((f) => f.period_type === "annual" && f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length < 2) {
    return naResult("Insufficient financial data (need at least 2 years)");
  }

  // --- Build historical DPS series ---
  const historicalDPS = buildHistoricalDPS(sorted);

  // Filter to years with actual dividend payments
  const dividendYears = historicalDPS.filter((h) => h.dps > 0);

  if (dividendYears.length === 0) {
    return naResult("No dividend history — company has never paid dividends");
  }

  const latest = sorted[sorted.length - 1];
  const latestDPS = dividendYears[dividendYears.length - 1];

  if (latestDPS.year < latest.fiscal_year - 1) {
    return naResult("Dividends discontinued — no payment in most recent 2 fiscal years");
  }

  const currentDPS = latestDPS.dps;

  // --- Validate: loss-making but paying dividends ---
  if (latest.net_income <= 0 && currentDPS > 0) {
    return naResult("Unsustainable dividends — company is currently unprofitable");
  }

  // --- Calculate dividend metrics ---
  const totalDividends = Math.abs(latest.dividends_paid || 0);
  const effectiveMarketCap = marketCap || currentPrice * sharesOutstanding;
  const dividendYield = effectiveMarketCap > 0 ? totalDividends / effectiveMarketCap : 0;
  const payoutRatio = latest.net_income > 0 ? totalDividends / latest.net_income : null;
  const fcfPayoutRatio = latest.free_cash_flow > 0 ? totalDividends / latest.free_cash_flow : null;
  const dividendCoverage = totalDividends > 0 && latest.net_income > 0
    ? latest.net_income / totalDividends
    : null;

  // --- Determine near-term growth rate ---
  const { nearTermGrowth, growthSource, dpsCAGR, dpsCAGRYears, analystEPSGrowth } =
    selectGrowthRate(dividendYears, estimates, sorted);

  // --- Validate Ke > g_terminal (Gordon Growth constraint) ---
  if (costOfEquity <= terminalGrowthRate) {
    return naResult(
      `Cost of Equity (${formatRatio(costOfEquity)}) must exceed terminal growth (${formatRatio(terminalGrowthRate)}) — Gordon Growth model diverges`
    );
  }

  // --- Project dividends (Stage 1) ---
  const projections: DDMProjectionYear[] = [];
  let pvDividends = 0;
  let lastDPS = currentDPS;

  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    const growthRate = nearTermGrowth;
    const dps = lastDPS * (1 + growthRate);
    const discountFactor = 1 / Math.pow(1 + costOfEquity, t);
    const pv = dps * discountFactor;

    projections.push({
      year: latest.fiscal_year + t,
      dps: Math.round(dps * 10000) / 10000,
      growth_rate: growthRate,
      discount_factor: discountFactor,
      pv,
    });

    pvDividends += pv;
    lastDPS = dps;
  }

  // --- Terminal value (Stage 2: Gordon Growth) ---
  const terminalDPS = lastDPS * (1 + terminalGrowthRate);
  const terminalValue = terminalDPS / (costOfEquity - terminalGrowthRate);
  const pvTerminal = terminalValue / Math.pow(1 + costOfEquity, PROJECTION_YEARS);

  const fairValue = pvDividends + pvTerminal;

  if (fairValue <= 0) {
    return naResult("Computed fair value is non-positive");
  }

  // --- Sensitivity matrix (5×5) ---
  const sensitivityMatrix = buildSensitivityMatrix(
    currentDPS,
    costOfEquity,
    nearTermGrowth,
    terminalGrowthRate
  );

  // --- Low/high from sensitivity corners ---
  const allPrices = sensitivityMatrix.prices.flat().filter((p) => p > 0);
  const lowEstimate = allPrices.length > 0 ? Math.min(...allPrices) : fairValue * 0.8;
  const highEstimate = allPrices.length > 0 ? Math.max(...allPrices) : fairValue * 1.2;

  const upside = currentPrice > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : 0;

  const details: DDMDetails = {
    current_dps: currentDPS,
    dividend_yield: dividendYield,
    payout_ratio: payoutRatio,
    fcf_payout_ratio: fcfPayoutRatio,
    dividend_coverage: dividendCoverage,
    historical_dps: historicalDPS,
    dps_cagr: dpsCAGR,
    dps_cagr_years: dpsCAGRYears,
    near_term_growth: nearTermGrowth,
    growth_source: growthSource,
    analyst_eps_growth: analystEPSGrowth,
    terminal_growth: terminalGrowthRate,
    cost_of_equity: costOfEquity,
    projections,
    pv_dividends: pvDividends,
    terminal_dps: terminalDPS,
    terminal_value: terminalValue,
    pv_terminal: pvTerminal,
    sensitivity_matrix: sensitivityMatrix,
  };

  return {
    model_type: "ddm",
    fair_value: Math.round(fairValue * 100) / 100,
    upside_percent: Math.round(upside * 10) / 10,
    low_estimate: Math.round(lowEstimate * 100) / 100,
    high_estimate: Math.round(highEstimate * 100) / 100,
    assumptions: {
      cost_of_equity: formatRatio(costOfEquity),
      near_term_growth: formatRatio(nearTermGrowth),
      growth_source: growthSource,
      terminal_growth: formatRatio(terminalGrowthRate),
      projection_years: PROJECTION_YEARS,
      current_dps: `$${currentDPS.toFixed(4)}`,
      payout_ratio: payoutRatio !== null ? formatRatio(payoutRatio) : "N/A",
    },
    details: details as unknown as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  };
}

// --- Internal helpers ---

function buildHistoricalDPS(sorted: FinancialStatement[]): DDMHistoricalDPS[] {
  const result: DDMHistoricalDPS[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const dividendsPaid = Math.abs(f.dividends_paid || 0);
    const shares = f.shares_outstanding;
    const dps = (shares && shares > 0) ? dividendsPaid / shares : 0;
    const payoutRatio = f.net_income > 0 ? dividendsPaid / f.net_income : null;

    const prevDPS = i > 0 ? result[i - 1].dps : null;
    const yoyGrowth = prevDPS !== null && prevDPS > 0
      ? (dps - prevDPS) / prevDPS
      : null;

    result.push({
      year: f.fiscal_year,
      dividends_paid: dividendsPaid,
      shares_outstanding: shares,
      dps,
      net_income: f.net_income,
      payout_ratio: payoutRatio,
      yoy_growth: yoyGrowth,
    });
  }

  return result;
}

function selectGrowthRate(
  dividendYears: DDMHistoricalDPS[],
  estimates: AnalystEstimate[] | undefined,
  sorted: FinancialStatement[]
): {
  nearTermGrowth: number;
  growthSource: DDMGrowthSource;
  dpsCAGR: number | null;
  dpsCAGRYears: number | null;
  analystEPSGrowth: number | null;
} {
  // 1. Historical DPS CAGR
  let dpsCAGR: number | null = null;
  let dpsCAGRYears: number | null = null;

  if (dividendYears.length >= MIN_YEARS_FOR_CAGR) {
    const years = Math.min(dividendYears.length - 1, 5);
    const startDPS = dividendYears[dividendYears.length - 1 - years].dps;
    const endDPS = dividendYears[dividendYears.length - 1].dps;
    if (startDPS > 0 && endDPS > 0) {
      dpsCAGR = cagr(startDPS, endDPS, years);
      dpsCAGRYears = years;
    }
  }

  // 2. Analyst EPS growth (forward consensus)
  let analystEPSGrowth: number | null = null;

  if (estimates && estimates.length >= 2) {
    const sortedEst = [...estimates].sort((a, b) => a.period.localeCompare(b.period));
    const validEst = sortedEst.filter((e) => e.eps_estimate > 0 && e.number_of_analysts >= 3);

    if (validEst.length >= 2) {
      // Use first and last valid estimate to compute forward EPS CAGR
      const first = validEst[0];
      const last = validEst[validEst.length - 1];
      const yearSpan = parseInt(last.period) - parseInt(first.period);
      if (yearSpan > 0 && first.eps_estimate > 0 && last.eps_estimate > 0) {
        analystEPSGrowth = cagr(first.eps_estimate, last.eps_estimate, yearSpan);
      }
    } else if (validEst.length === 1) {
      // Single estimate: compare to latest actual EPS
      const latestEPS = sorted[sorted.length - 1].eps_diluted || sorted[sorted.length - 1].eps;
      if (latestEPS > 0 && validEst[0].eps_estimate > 0) {
        analystEPSGrowth = (validEst[0].eps_estimate - latestEPS) / latestEPS;
      }
    }
  }

  // 3. Select growth rate
  let nearTermGrowth: number;
  let growthSource: DDMGrowthSource;

  if (dpsCAGR !== null && analystEPSGrowth !== null) {
    // Blend: 50% DPS CAGR + 50% analyst EPS growth
    nearTermGrowth = 0.5 * dpsCAGR + 0.5 * analystEPSGrowth;
    growthSource = "blended";
  } else if (dpsCAGR !== null) {
    nearTermGrowth = dpsCAGR;
    growthSource = "historical_dps_cagr";
  } else if (analystEPSGrowth !== null) {
    nearTermGrowth = analystEPSGrowth;
    growthSource = "analyst_eps_cagr";
  } else {
    // Fallback: GDP-like growth
    nearTermGrowth = 0.03;
    growthSource = "gdp_fallback";
  }

  // Clamp
  nearTermGrowth = clamp(nearTermGrowth, MIN_DPS_GROWTH, MAX_DPS_GROWTH);

  return { nearTermGrowth, growthSource, dpsCAGR, dpsCAGRYears, analystEPSGrowth };
}

function buildSensitivityMatrix(
  currentDPS: number,
  ke: number,
  nearTermGrowth: number,
  terminalGrowth: number
): { ke_values: number[]; growth_values: number[]; prices: number[][] } {
  const keValues: number[] = [];
  const growthValues: number[] = [];

  // Build axis values centered on base case
  for (let i = 0; i < SENSITIVITY_STEPS; i++) {
    const offset = i - Math.floor(SENSITIVITY_STEPS / 2);
    keValues.push(ke + offset * (KE_BAND / Math.floor(SENSITIVITY_STEPS / 2)));
    growthValues.push(
      clamp(
        nearTermGrowth + offset * (GROWTH_BAND / Math.floor(SENSITIVITY_STEPS / 2)),
        MIN_DPS_GROWTH,
        MAX_DPS_GROWTH
      )
    );
  }

  const prices: number[][] = [];

  for (const keVal of keValues) {
    const row: number[] = [];
    for (const gVal of growthValues) {
      // Project DPS and compute fair value for this scenario
      let lastDPS = currentDPS;
      let pvDiv = 0;

      for (let t = 1; t <= PROJECTION_YEARS; t++) {
        const dps = lastDPS * (1 + gVal);
        pvDiv += dps / Math.pow(1 + keVal, t);
        lastDPS = dps;
      }

      // Terminal: use same terminalGrowth (it's archetype-based, not varied)
      if (keVal > terminalGrowth) {
        const tvDPS = lastDPS * (1 + terminalGrowth);
        const tv = tvDPS / (keVal - terminalGrowth);
        const pvTV = tv / Math.pow(1 + keVal, PROJECTION_YEARS);
        const fv = pvDiv + pvTV;
        row.push(Math.round(fv * 100) / 100);
      } else {
        row.push(0); // divergent
      }
    }
    prices.push(row);
  }

  return {
    ke_values: keValues.map((v) => Math.round(v * 1000) / 1000),
    growth_values: growthValues.map((v) => Math.round(v * 1000) / 1000),
    prices,
  };
}

function naResult(note: string): ValuationResult {
  return {
    model_type: "ddm",
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}