// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// FCFE (Free Cash Flow to Equity) DCF Model — 5Y/10Y
// Revenue → Net Income → FCFE, discount by Cost of Equity
// ============================================================

import type {
  FinancialStatement,
  AnalystEstimate,
  ValuationResult,
  DCFProjectionYearFCFE,
} from "../types.js";
import { avg, projectRevenue } from "./dcf-helpers.js";

// --- Public Interface ---

export interface DCFFCFEInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  costOfEquity: number;       // Discount rate (Ke)
  currentPrice: number;
  sharesOutstanding: number;
  cashAndEquivalents: number;
  totalDebt: number;
  terminalGrowthRate?: number; // Default 2.5%
}

/**
 * DCF valuation using FCFE (Free Cash Flow to Equity) approach.
 * Revenue → Net Margin → Net Income - CapEx = FCFE
 * Discounted by Cost of Equity. Equity Value = PV(FCFE) + Cash - Debt.
 */
export function calculateDCF(
  inputs: DCFFCFEInputs,
  projectionYears: 5 | 10 = 5
): ValuationResult {
  const {
    historicals,
    estimates,
    costOfEquity,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    terminalGrowthRate: termGrowth = 0.025,
  } = inputs;

  const revenueProjection = projectRevenue(historicals, estimates, projectionYears);

  // Calculate historical averages for net margin and capex
  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);
  const recent = sorted.slice(-5);

  const netMargins = recent
    .filter((f) => f.revenue > 0)
    .map((f) => f.net_income / f.revenue);
  const avgNetMargin = netMargins.length > 0 ? avg(netMargins) : 0.10;

  // Sort estimates by period ascending for margin derivation
  const sortedEstimates = [...estimates].sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  // Build per-year margin from analyst estimates (EPS × shares / revenue)
  const lastYear = sorted[sorted.length - 1].fiscal_year;
  const analystMargins = new Map<number, number>();
  for (const est of sortedEstimates) {
    const year = parseInt(est.period);
    if (est.eps_estimate > 0 && est.revenue_estimate > 0 && sharesOutstanding > 0) {
      const derivedNetIncome = est.eps_estimate * sharesOutstanding;
      const margin = derivedNetIncome / est.revenue_estimate;
      // Sanity check: margin should be between -50% and 80%
      if (margin > -0.5 && margin < 0.8) {
        analystMargins.set(year, margin);
      }
    }
  }

  // CapEx & D&A as stable % of Revenue (historical averages)
  const lastFinancial = sorted[sorted.length - 1];
  const lastRevenue = lastFinancial.revenue;

  const daRatios = recent
    .filter((f) => f.depreciation_amortization > 0)
    .map((f) => f.depreciation_amortization / f.revenue);
  const daRatio = daRatios.length > 0 ? avg(daRatios) : 0.03; // fallback 3%

  const capexRatios = recent
    .filter((f) => f.capital_expenditure !== 0)
    .map((f) => Math.abs(f.capital_expenditure) / f.revenue);
  const capexRatio = capexRatios.length > 0 ? avg(capexRatios) : 0.05; // fallback 5%

  const ke = costOfEquity;
  const g = termGrowth;

  // Build FCFE projections
  const projections: DCFProjectionYearFCFE[] = [];

  for (let i = 0; i < revenueProjection.revenues.length; i++) {
    const revenue = revenueProjection.revenues[i];
    const year = revenueProjection.years[i];

    // Dynamic net margin: analyst-derived → fade to historical average
    let netMargin: number;
    const analystMargin = analystMargins.get(year);
    if (analystMargin !== undefined) {
      netMargin = analystMargin;
    } else {
      // Fade from last known margin toward historical average
      const lastKnownMargin = analystMargins.size > 0
        ? Array.from(analystMargins.values()).pop()!
        : avgNetMargin;
      const yearsBeyondAnalyst = year - lastYear - analystMargins.size;
      const fadeSteps = projectionYears - analystMargins.size;
      if (fadeSteps > 0 && yearsBeyondAnalyst > 0) {
        const fadeFactor = Math.max(0, 1 - yearsBeyondAnalyst / fadeSteps);
        netMargin = lastKnownMargin * fadeFactor + avgNetMargin * (1 - fadeFactor);
      } else {
        netMargin = lastKnownMargin;
      }
    }

    const netIncome = revenue * netMargin;

    // D&A and CapEx as % of revenue (stable ratios from historical averages)
    // FCFE = Net Income + D&A − CapEx
    const yearDA = revenue * daRatio;
    const yearCapex = revenue * capexRatio;

    const fcfe = netIncome + yearDA - yearCapex;
    const t = i + 1;
    const discountFactor = 1 / Math.pow(1 + ke, t);
    const pvFCFE = fcfe * discountFactor;

    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      depreciation_amortization: yearDA,
      capital_expenditure: yearCapex,
      fcfe,
      discount_factor: discountFactor,
      pv_fcfe: pvFCFE,
    });
  }

  // Terminal value (Gordon Growth on FCFE)
  const lastFCFE = projections[projections.length - 1].fcfe;
  const terminalValue =
    ke > g ? (lastFCFE * (1 + g)) / (ke - g) : lastFCFE * 20;

  const pvTerminalValue =
    terminalValue / Math.pow(1 + ke, projectionYears);
  const pvFCFETotal = projections.reduce((sum, p) => sum + p.pv_fcfe, 0);

  // Equity Value = PV of FCFE + PV of Terminal + Cash - Debt
  const totalPV = pvFCFETotal + pvTerminalValue;
  const equityValue = totalPV + cashAndEquivalents - totalDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // Sensitivity matrix (Discount Rate × Terminal Growth)
  const sensitivity = buildFCFESensitivityMatrix(
    projections,
    cashAndEquivalents,
    totalDebt,
    sharesOutstanding,
    ke,
    g
  );

  const allPrices = sensitivity.prices.flat();
  const lowEstimate = Math.min(...allPrices);
  const highEstimate = Math.max(...allPrices);

  return {
    model_type: "dcf_growth_exit_5y", // Keep type for DB compat
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      revenue_growth_rates: revenueProjection.growthRates.map(
        (r) => Math.round(r * 10000) / 100
      ),
      revenue_source: revenueProjection.source,
      net_margin: Math.round(avgNetMargin * 10000) / 100,
      net_margins_by_year: projections.map((p) => Math.round(p.net_margin * 10000) / 100),
      margin_source: analystMargins.size > 0 ? "analyst" : "historical",
      capex_pct_revenue: Math.round(capexRatio * 10000) / 100,
      da_pct_revenue: Math.round(daRatio * 10000) / 100,
      discount_rate: Math.round(ke * 10000) / 100,
      terminal_growth_rate: Math.round(g * 10000) / 100,
      projection_years: projectionYears,
    },
    details: {
      projections,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcfe_total: pvFCFETotal,
      cash_and_equivalents: cashAndEquivalents,
      total_debt: totalDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}

/**
 * Sensitivity matrix for FCFE DCF: Discount Rate × Terminal Growth Rate
 */
export function buildFCFESensitivityMatrix(
  projections: DCFProjectionYearFCFE[],
  cash: number,
  debt: number,
  sharesOutstanding: number,
  baseKe: number,
  baseGrowth: number,
): { discount_rate_values: number[]; growth_values: number[]; prices: number[][] } {
  const keValues = [
    baseKe - 0.02,
    baseKe - 0.01,
    baseKe,
    baseKe + 0.01,
    baseKe + 0.02,
  ];
  const growthValues = [0.01, 0.02, baseGrowth, 0.04, 0.05].sort((a, b) => a - b);
  // Deduplicate growth values
  const uniqueGrowth = [...new Set(growthValues.map(v => Math.round(v * 1000) / 1000))];

  const prices: number[][] = [];
  const n = projections.length;

  for (const ke of keValues) {
    const row: number[] = [];
    for (const g of uniqueGrowth) {
      let pvFCFESum = 0;
      for (let i = 0; i < n; i++) {
        const t = i + 1;
        pvFCFESum += projections[i].fcfe / Math.pow(1 + ke, t);
      }

      const lastFCFE = projections[n - 1].fcfe;
      let tv: number;
      if (ke <= g) {
        tv = lastFCFE * 20;
      } else {
        tv = (lastFCFE * (1 + g)) / (ke - g);
      }
      const pvTV = tv / Math.pow(1 + ke, n);
      const totalPV = pvFCFESum + pvTV;
      const equityValue = totalPV + cash - debt;
      row.push(Math.max(0, equityValue / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: keValues, growth_values: uniqueGrowth, prices };
}