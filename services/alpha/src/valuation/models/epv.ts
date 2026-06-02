// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Earnings Power Value (EPV)
// Perpetuity-based valuation: what is the company worth if it
// maintains its current normalized earnings forever (zero growth)?
//
// Steps:
//   1. Sustainable revenue × sustainable gross margin = sustainable gross profit
//   2. Sustainable gross profit − maintenance OpEx = normalized EBIT
//   3. After-tax normalized EBIT − avg(CapEx − D&A) = normalized earnings
//   4. Normalized earnings / WACC = enterprise value → equity value per share
// ============================================================

import type { FinancialStatement, ValuationResult } from "../types.js";
import { avg } from "./dcf-helpers.js";
import { formatRatio } from "../format.js";

// --- WACC sensitivity band for low/high estimates ---
const WACC_BAND = 0.015; // ±1.5%

// --- Public types ---

export interface EPVHistoricalYear {
  year: number;
  revenue: number;
  gross_profit: number;
  gross_margin: number;
  rnd: number;
  sga: number;
  total_opex: number;
  opex_pct: number; // total_opex / revenue
  capex: number;
  da: number; // depreciation & amortization
  capex_minus_da: number;
  tax_rate: number;
}

export interface EPVDetails {
  historical: EPVHistoricalYear[];
  // Step 1
  sustainable_revenue: number;
  sustainable_gross_margin: number;
  sustainable_gross_profit: number;
  // Step 2
  maintenance_opex_pct: number;
  maintenance_opex: number;
  normalized_ebit: number;
  avg_tax_rate: number;
  after_tax_normalized_ebit: number;
  // Step 3
  avg_capex_minus_da: number;
  normalized_earnings: number;
  // Step 4
  wacc: number;
  wacc_low: number;
  wacc_high: number;
  enterprise_value: number;
  enterprise_value_low: number;
  enterprise_value_high: number;
  net_debt: number;
  equity_value: number;
  equity_value_low: number;
  equity_value_high: number;
  shares_outstanding: number;
}

export interface EPVInputs {
  historicals: FinancialStatement[]; // sorted descending
  wacc: number;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
}

/**
 * Calculate Earnings Power Value.
 * Returns fair_value = 0 with a note if the company has negative normalized earnings.
 */
export function calculateEPV(inputs: EPVInputs): ValuationResult {
  const { historicals, wacc, currentPrice, sharesOutstanding, netDebt } = inputs;

  // Need at least 2 years of data
  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => b.fiscal_year - a.fiscal_year);

  if (sorted.length < 2) {
    return naResult("Insufficient historical data (need ≥ 2 years)");
  }

  // --- Build historical detail rows ---
  const historical: EPVHistoricalYear[] = sorted.map((f) => {
    const capex = Math.abs(f.capital_expenditure); // capex stored as negative
    const da = f.depreciation_amortization;
    const rnd = f.rnd_expense;
    const sga = f.sga_expense;
    const totalOpex = rnd + sga;
    const grossProfit = f.gross_profit > 0 ? f.gross_profit : f.revenue - f.cost_of_revenue;
    const grossMargin = f.revenue > 0 ? grossProfit / f.revenue : 0;

    // Effective tax rate: use reported, fallback compute, fallback 21%
    let taxRate = f.tax_rate;
    if (!taxRate || taxRate <= 0 || taxRate > 0.6) {
      taxRate =
        f.income_before_tax > 0 ? f.income_tax / f.income_before_tax : 0.21;
    }
    if (taxRate < 0) taxRate = 0.21;

    return {
      year: f.fiscal_year,
      revenue: f.revenue,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      rnd,
      sga,
      total_opex: totalOpex,
      opex_pct: f.revenue > 0 ? totalOpex / f.revenue : 0,
      capex,
      da,
      capex_minus_da: capex - da,
      tax_rate: taxRate,
    };
  });

  // --- Step 1: Sustainable Revenue & Gross Profit ---
  const sustainableRevenue = historical[0].revenue; // latest year
  const sustainableGrossMargin = avg(historical.map((h) => h.gross_margin));
  const sustainableGrossProfit = sustainableRevenue * sustainableGrossMargin;

  // --- Step 2: Normalized EBIT ---
  // Maintenance OpEx = sustainable revenue × avg(opex / revenue)
  const maintenanceOpexPct = avg(historical.map((h) => h.opex_pct));
  const maintenanceOpex = sustainableRevenue * maintenanceOpexPct;

  const normalizedEBIT = sustainableGrossProfit - maintenanceOpex;
  const avgTaxRate = avg(historical.map((h) => h.tax_rate));
  const afterTaxNormalizedEBIT = normalizedEBIT * (1 - avgTaxRate);

  // --- Step 3: Normalized Earnings ---
  const avgCapexMinusDA = avg(historical.map((h) => h.capex_minus_da));
  const normalizedEarnings = afterTaxNormalizedEBIT - Math.max(0, avgCapexMinusDA);

  // --- Guard: negative normalized earnings ---
  if (normalizedEarnings <= 0) {
    return naResult(
      "Negative normalized earnings — EPV requires sustained profitability"
    );
  }

  // --- Step 4: Valuation ---
  const waccLow = Math.max(0.03, wacc - WACC_BAND);
  const waccHigh = wacc + WACC_BAND;

  const enterpriseValue = normalizedEarnings / wacc;
  const enterpriseValueLow = normalizedEarnings / waccHigh; // higher WACC = lower value
  const enterpriseValueHigh = normalizedEarnings / waccLow; // lower WACC = higher value

  const equityValue = enterpriseValue - netDebt;
  const equityValueLow = enterpriseValueLow - netDebt;
  const equityValueHigh = enterpriseValueHigh - netDebt;

  const fairValue = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  const lowEstimate =
    sharesOutstanding > 0 ? Math.max(0, equityValueLow / sharesOutstanding) : 0;
  const highEstimate =
    sharesOutstanding > 0
      ? Math.max(0, equityValueHigh / sharesOutstanding)
      : 0;

  if (fairValue <= 0) {
    return naResult("Equity value is negative (debt exceeds enterprise value)");
  }

  const upside =
    currentPrice > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : 0;

  const details: EPVDetails = {
    historical,
    sustainable_revenue: sustainableRevenue,
    sustainable_gross_margin: sustainableGrossMargin,
    sustainable_gross_profit: sustainableGrossProfit,
    maintenance_opex_pct: maintenanceOpexPct,
    maintenance_opex: maintenanceOpex,
    normalized_ebit: normalizedEBIT,
    avg_tax_rate: avgTaxRate,
    after_tax_normalized_ebit: afterTaxNormalizedEBIT,
    avg_capex_minus_da: avgCapexMinusDA,
    normalized_earnings: normalizedEarnings,
    wacc,
    wacc_low: waccLow,
    wacc_high: waccHigh,
    enterprise_value: enterpriseValue,
    enterprise_value_low: enterpriseValueLow,
    enterprise_value_high: enterpriseValueHigh,
    net_debt: netDebt,
    equity_value: equityValue,
    equity_value_low: equityValueLow,
    equity_value_high: equityValueHigh,
    shares_outstanding: sharesOutstanding,
  };

  return {
    model_type: "epv",
    fair_value: Math.round(fairValue * 100) / 100,
    upside_percent: Math.round(upside * 10) / 10,
    low_estimate: Math.round(lowEstimate * 100) / 100,
    high_estimate: Math.round(highEstimate * 100) / 100,
    assumptions: {
      wacc: Math.round(wacc * 1000) / 1000,
      wacc_range: `${formatRatio(waccLow)} – ${formatRatio(waccHigh)}`,
      sustainable_gross_margin: formatRatio(sustainableGrossMargin),
      avg_tax_rate: formatRatio(avgTaxRate),
      years_of_data: historical.length,
    },
    details: details as unknown as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  };
}

function naResult(note: string): ValuationResult {
  return {
    model_type: "epv",
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}