// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Revenue DCF — Margin Convergence Model for Pre-Profit Companies
//
// Instead of projecting historical expense ratios (which perpetuate losses),
// this model assumes operating margin converges to the industry target margin
// of mature, profitable peers over the projection period.
//
// Based on Damodaran's approach for valuing young growth companies.
//
// Two variants: 5Y (cross-check) and 10Y (primary).
// The 10Y model gives capital-intensive pre-profit companies more
// years of positive FCFF to offset the early-year negative cash flows.
// ============================================================

import type {
  ValuationResult,
  FinancialStatement,
  AnalystEstimate,
  ValuationModelType,
} from "../types.js";
import { projectRevenue, avg, clamp } from "./dcf-helpers.js";
import { round2 } from "./statistics.js";

// --- Inputs ---

export interface RevenueDCFInputs {
  historicals: FinancialStatement[]; // sorted desc (most recent first)
  estimates: AnalystEstimate[];
  wacc: number;
  currentPrice: number;
  sharesOutstanding: number;
  cashAndEquivalents: number;
  totalDebt: number;
  terminalGrowthRate: number;
  /** Target operating margin from mature industry peers (e.g., 0.10 = 10%) */
  targetOperatingMargin: number;
}

// --- Projection Year ---

export interface RevenueDCFProjectionYear {
  year: number;
  revenue: number;
  revenue_growth: number;
  operating_margin: number;
  operating_income: number;
  tax: number;
  nopat: number;
  depreciation: number;
  capex: number;
  delta_nwc: number;
  fcff: number;
  timing: number;
  discount_factor: number;
  pv_fcff: number;
}

// --- Public API ---

/** Revenue DCF 5Y — margin convergence over 5 years (cross-check). */
export function calculateRevenueDCF(inputs: RevenueDCFInputs): ValuationResult {
  return calculateRevenueDCFInternal(inputs, 5, "revenue_dcf_5y");
}

/** Revenue DCF 10Y — margin convergence over 5 years, then 5 years at target (primary). */
export function calculateRevenueDCF10Y(inputs: RevenueDCFInputs): ValuationResult {
  return calculateRevenueDCFInternal(inputs, 10, "revenue_dcf_10y");
}

// --- Core Model ---

/**
 * Internal Revenue DCF computation.
 *
 * Margin convergence: linear fade from current to target over min(numYears, 5).
 * Years 6–10 (if numYears=10): margin stays at target, revenue continues growing.
 * Terminal value: Gordon Growth on final-year FCFF.
 */
function calculateRevenueDCFInternal(
  inputs: RevenueDCFInputs,
  numYears: number,
  modelType: ValuationModelType,
): ValuationResult {
  const {
    historicals,
    estimates,
    wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    terminalGrowthRate,
    targetOperatingMargin,
  } = inputs;

  // Sort historicals descending
  const sorted = [...historicals].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];

  if (!latest || !latest.revenue || latest.revenue <= 0) {
    return naResult(modelType, "No historical revenue data available for Revenue DCF");
  }

  // 1. Project revenue
  const revenueProjection = projectRevenue(sorted, estimates, numYears);

  // 2. Current operating margin
  const currentOPMargin = latest.operating_income
    ? latest.operating_income / latest.revenue
    : -0.20; // default to -20% if no operating income data

  // 3. Historical ratios for D&A, CapEx, NWC
  const withRevenue = sorted.filter((f) => f.revenue > 0).slice(0, 5);
  const daPct = avg(withRevenue.map((f) => (f.depreciation_amortization || 0) / f.revenue)) || 0.05;
  const historicalCapexPct = avg(withRevenue.map((f) => Math.abs(f.capital_expenditure || 0) / f.revenue)) || 0.08;
  // Pre-profit companies in build-out phase often have inflated capex.
  // Fade toward maintenance level (D&A × 1.5, min 6%) as the company matures.
  const targetCapexPct = Math.max(daPct * 1.5, 0.06);
  const nwcValues = withRevenue.map((f) => {
    const ca = (f.accounts_receivable || 0) + (f.inventory || 0);
    const cl = f.accounts_payable || 0;
    return (ca - cl) / f.revenue;
  });
  const nwcPct = avg(nwcValues) || 0.10;

  // Tax rate: use historical effective rate when positive, else default to 21%
  const profitableYears = withRevenue.filter((f) => f.income_before_tax > 0);
  const taxRate = profitableYears.length > 0
    ? clamp(avg(profitableYears.map((f) => f.income_tax / f.income_before_tax)), 0, 0.40)
    : 0.21;

  // 4. Build projection
  // Margin converges over min(numYears, 5) years, then stays at target
  const convergenceYears = Math.min(numYears, 5);
  const projections: RevenueDCFProjectionYear[] = [];
  const prevNWC = (
    (latest.accounts_receivable || 0) +
    (latest.inventory || 0) -
    (latest.accounts_payable || 0)
  );

  for (let i = 0; i < numYears; i++) {
    const year = revenueProjection.years[i];
    const revenue = revenueProjection.revenues[i];
    const revenueGrowth = revenueProjection.growthRates[i];

    // Margin: converge over convergenceYears, then hold at target
    const marginProgress = Math.min((i + 1) / convergenceYears, 1.0);
    const operatingMargin = currentOPMargin + (targetOperatingMargin - currentOPMargin) * marginProgress;
    const operatingIncome = revenue * operatingMargin;

    // Tax: only apply when operating income > 0 (NOL shield when negative)
    const tax = operatingIncome > 0 ? operatingIncome * taxRate : 0;
    const nopat = operatingIncome - tax;

    // D&A, CapEx, NWC as % of revenue (capex fades from build-out to maintenance)
    const depreciation = revenue * daPct;
    const capexProgress = Math.min((i + 1) / numYears, 1.0);
    const yearCapexPct = historicalCapexPct + (targetCapexPct - historicalCapexPct) * capexProgress;
    const capex = revenue * yearCapexPct;
    const currentNWC = revenue * nwcPct;
    const deltaNWC = currentNWC - (i === 0 ? prevNWC : projections[i - 1].revenue * nwcPct);

    // FCFF = NOPAT + D&A - CapEx - Delta NWC
    const fcff = nopat + depreciation - capex - deltaNWC;

    // Mid-year convention
    const timing = i + 0.5;
    const discountFactor = 1 / Math.pow(1 + wacc, timing);
    const pvFcff = fcff * discountFactor;

    projections.push({
      year,
      revenue: round2(revenue),
      revenue_growth: round2(revenueGrowth * 100) / 100,
      operating_margin: round2(operatingMargin * 100) / 100,
      operating_income: round2(operatingIncome),
      tax: round2(tax),
      nopat: round2(nopat),
      depreciation: round2(depreciation),
      capex: round2(capex),
      delta_nwc: round2(deltaNWC),
      fcff: round2(fcff),
      timing,
      discount_factor: round2(discountFactor * 10000) / 10000,
      pv_fcff: round2(pvFcff),
    });
  }

  // 5. Terminal value (Gordon Growth on terminal year FCFF)
  const terminalFCFF = projections[numYears - 1].fcff;
  let terminalValue = 0;
  if (terminalFCFF > 0 && wacc > terminalGrowthRate) {
    terminalValue = (terminalFCFF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  }
  const terminalTiming = numYears - 0.5; // mid-year of last year
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, terminalTiming);

  // 6. Enterprise value → Equity value → Fair price
  const pvFcffTotal = projections.reduce((sum, p) => sum + p.pv_fcff, 0);
  const enterpriseValue = pvFcffTotal + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = equityValue / sharesOutstanding;

  // For pre-profit companies, fair value can be low or even negative if margin
  // convergence is insufficient within the projection period. We still report the
  // result (floored at 0) rather than returning N/A — the sensitivity matrix shows
  // scenarios where the value turns positive.
  const effectiveFairValue = Math.max(0, fairValue);

  const upside = effectiveFairValue > 0 ? ((effectiveFairValue - currentPrice) / currentPrice) * 100 : -100;

  // 7. Sensitivity matrix: WACC × Target Operating Margin
  const waccValues = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
  const marginValues = [
    targetOperatingMargin - 0.06,
    targetOperatingMargin - 0.03,
    targetOperatingMargin,
    targetOperatingMargin + 0.03,
    targetOperatingMargin + 0.06,
  ];

  const sensitivityPrices = waccValues.map((w) =>
    marginValues.map((m) => {
      const sense = calculateRevenueDCFCore(sorted, estimates, w, m, numYears, {
        taxRate, daPct, historicalCapexPct, targetCapexPct, nwcPct, prevNWC, currentOPMargin,
        terminalGrowthRate, sharesOutstanding, cashAndEquivalents, totalDebt,
      });
      return round2(sense);
    })
  );

  // Low/high from sensitivity edges
  const allSensitivityPrices = sensitivityPrices.flat().filter((p) => p > 0);
  const lowEstimate = allSensitivityPrices.length > 0 ? Math.min(...allSensitivityPrices) : fairValue * 0.7;
  const highEstimate = allSensitivityPrices.length > 0 ? Math.max(...allSensitivityPrices) : fairValue * 1.3;

  return {
    model_type: modelType,
    fair_value: round2(effectiveFairValue),
    upside_percent: round2(upside),
    low_estimate: round2(lowEstimate),
    high_estimate: round2(highEstimate),
    assumptions: {
      current_operating_margin: round2(currentOPMargin * 100) / 100,
      target_operating_margin: round2(targetOperatingMargin * 100) / 100,
      wacc: round2(wacc * 100) / 100,
      terminal_growth_rate: terminalGrowthRate,
      tax_rate: round2(taxRate * 100) / 100,
      da_pct: round2(daPct * 100) / 100,
      historical_capex_pct: round2(historicalCapexPct * 100) / 100,
      target_capex_pct: round2(targetCapexPct * 100) / 100,
      nwc_pct: round2(nwcPct * 100) / 100,
      projection_years: numYears,
      convergence_years: convergenceYears,
      revenue_source: revenueProjection.source,
    },
    details: {
      projections,
      terminal_value: round2(terminalValue),
      pv_terminal_value: round2(pvTerminalValue),
      pv_fcff_total: round2(pvFcffTotal),
      enterprise_value: round2(enterpriseValue),
      net_debt: round2(netDebt),
      equity_value: round2(equityValue),
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: {
        discount_rate_values: waccValues.map((v) => round2(v * 100) / 100),
        margin_values: marginValues.map((v) => round2(v * 100) / 100),
        prices: sensitivityPrices,
      },
    },
    computed_at: new Date().toISOString(),
  };
}

// --- Internal core for sensitivity recalculation ---

function calculateRevenueDCFCore(
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[],
  wacc: number,
  targetMargin: number,
  numYears: number,
  params: {
    taxRate: number;
    daPct: number;
    historicalCapexPct: number;
    targetCapexPct: number;
    nwcPct: number;
    prevNWC: number;
    currentOPMargin: number;
    terminalGrowthRate: number;
    sharesOutstanding: number;
    cashAndEquivalents: number;
    totalDebt: number;
  },
): number {
  const revenueProjection = projectRevenue(historicals, estimates, numYears);
  const convergenceYears = Math.min(numYears, 5);

  let pvFcffTotal = 0;
  let lastFcff = 0;
  let prevNWCLocal = params.prevNWC;

  for (let i = 0; i < numYears; i++) {
    const revenue = revenueProjection.revenues[i];
    const marginProgress = Math.min((i + 1) / convergenceYears, 1.0);
    const opMargin = params.currentOPMargin + (targetMargin - params.currentOPMargin) * marginProgress;
    const opIncome = revenue * opMargin;
    const tax = opIncome > 0 ? opIncome * params.taxRate : 0;
    const nopat = opIncome - tax;
    const da = revenue * params.daPct;
    const capexProgress = Math.min((i + 1) / numYears, 1.0);
    const yearCapexPct = params.historicalCapexPct + (params.targetCapexPct - params.historicalCapexPct) * capexProgress;
    const capex = revenue * yearCapexPct;
    const currentNWC = revenue * params.nwcPct;
    const deltaNWC = currentNWC - prevNWCLocal;
    prevNWCLocal = currentNWC;
    const fcff = nopat + da - capex - deltaNWC;
    const timing = i + 0.5;
    pvFcffTotal += fcff / Math.pow(1 + wacc, timing);
    lastFcff = fcff;
  }

  let tvPV = 0;
  if (lastFcff > 0 && wacc > params.terminalGrowthRate) {
    const tv = (lastFcff * (1 + params.terminalGrowthRate)) / (wacc - params.terminalGrowthRate);
    tvPV = tv / Math.pow(1 + wacc, numYears - 0.5);
  }

  const ev = pvFcffTotal + tvPV;
  const equity = ev - (params.totalDebt - params.cashAndEquivalents);
  return equity / params.sharesOutstanding;
}

// --- N/A helper ---

function naResult(modelType: ValuationModelType, note: string): ValuationResult {
  return {
    model_type: modelType,
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}