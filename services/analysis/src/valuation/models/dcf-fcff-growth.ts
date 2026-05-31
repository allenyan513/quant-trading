// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// FCFF DCF Growth Exit (5Y / 10Y)
// Unlevered Free Cash Flow to Firm with Gordon Growth terminal value.
// N-year projection + 1 terminal year, mid-year discounting, WACC.
// ============================================================

import type { ValuationResult, DCFFCFFProjectionYear } from "../types.js";
import { avg, projectRevenue } from "./dcf-helpers.js";
import { MIN_DISCOUNT_TERMINAL_SPREAD, TERMINAL_EXIT_MULTIPLE } from "../constants.js";
import {
  type DCFFCFFInputs,
  computeExpenseRatios,
  buildDASchedule,
  computeWorkingCapitalDays,
  buildWorkingCapital,
} from "./dcf-fcff-builders.js";

export type { DCFFCFFInputs };

/** Build FCFF sensitivity matrix: WACC × Terminal Growth → Fair Value */
export function buildFCFFSensitivityMatrix(
  projections: DCFFCFFProjectionYear[],
  terminalFCFF: number,
  netDebt: number,
  sharesOutstanding: number,
  baseWACC: number,
  baseG: number,
  projectionYears: number = 5
): { discount_rate_values: number[]; growth_values: number[]; prices: number[][] } {
  const waccValues = [
    baseWACC - 0.02,
    baseWACC - 0.01,
    baseWACC,
    baseWACC + 0.01,
    baseWACC + 0.02,
  ];

  const gValues = [
    baseG - 0.01,
    baseG - 0.005,
    baseG,
    baseG + 0.005,
    baseG + 0.01,
  ];

  const prices: number[][] = [];

  for (const wacc of waccValues) {
    const row: number[] = [];
    for (const g of gValues) {
      let pvFCFF = 0;
      for (const p of projections) {
        pvFCFF += p.fcff / Math.pow(1 + wacc, p.timing);
      }
      const tv =
        wacc - g >= MIN_DISCOUNT_TERMINAL_SPREAD
          ? terminalFCFF / (wacc - g)
          : terminalFCFF * TERMINAL_EXIT_MULTIPLE;
      const pvTV = tv / Math.pow(1 + wacc, projectionYears);
      const ev = pvFCFF + pvTV;
      const equity = ev - netDebt;
      row.push(Math.max(0, equity / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: waccValues, growth_values: gValues, prices };
}

export function calculateFCFFInternal(inputs: DCFFCFFInputs, numYears: number): ValuationResult {
  const {
    historicals,
    estimates,
    wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    terminalGrowthRate: termGrowth = 0.025,
    usefulLife = 5,
  } = inputs;

  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length === 0) throw new Error("No historical revenue data available");

  const recent = sorted.slice(-5);
  const lastFinancial = sorted[sorted.length - 1];

  const revProj = projectRevenue(historicals, estimates, numYears);
  const ratios = computeExpenseRatios(recent);

  const capexRatios = recent
    .filter((f) => f.capital_expenditure !== 0)
    .map((f) => Math.abs(f.capital_expenditure) / f.revenue);
  const capexRatio = capexRatios.length > 0 ? avg(capexRatios) : 0.05;

  const historicalCapex = sorted
    .slice(-usefulLife)
    .map((f) => ({ year: f.fiscal_year, capex: Math.abs(f.capital_expenditure) }));

  const projectedCapex = revProj.revenues.map((rev, i) => ({
    year: revProj.years[i],
    capex: rev * capexRatio,
  }));

  const daSchedule = buildDASchedule(historicalCapex, projectedCapex, revProj.years, usefulLife);

  const wcDays = computeWorkingCapitalDays(recent);

  const baseAR = lastFinancial.accounts_receivable || 0;
  const baseAP = lastFinancial.accounts_payable || 0;
  const baseInv = lastFinancial.inventory || 0;
  const baseNWC = baseAR - baseAP + baseInv;

  const cogsValues = revProj.revenues.map((rev) => rev * ratios.cogs_pct);

  const wc = buildWorkingCapital(
    revProj.years, revProj.revenues, cogsValues,
    wcDays.dso, wcDays.dpo, wcDays.dio, baseNWC
  );

  const projections: DCFFCFFProjectionYear[] = [];
  const g = termGrowth;

  for (let i = 0; i < numYears; i++) {
    const revenue = revProj.revenues[i];
    const prevRevenue = i === 0 ? lastFinancial.revenue : revProj.revenues[i - 1];
    const revenueGrowth = prevRevenue > 0 ? (revenue - prevRevenue) / prevRevenue : 0;

    const cogs = revenue * ratios.cogs_pct;
    const grossProfit = revenue - cogs;
    const sga = revenue * ratios.sga_pct;
    const rnd = revenue * ratios.rnd_pct;
    const operatingIncome = grossProfit - sga - rnd;

    const interestExpense = revenue * ratios.interest_pct;
    const incomeBT = operatingIncome - interestExpense;
    const tax = Math.max(0, incomeBT * ratios.tax_rate);
    const netIncome = incomeBT - tax;

    const depreciation = daSchedule.totals[i];
    const ebitda = incomeBT + interestExpense + depreciation;

    const capex = revenue * capexRatio;
    const deltaNWC = wc.delta_nwc[i];

    const fcff = ebitda - tax - capex - deltaNWC;
    const timing = i + 0.5;
    const discountFactor = 1 / Math.pow(1 + wacc, timing);

    projections.push({
      year: revProj.years[i],
      revenue,
      revenue_growth: revenueGrowth,
      cogs,
      gross_profit: grossProfit,
      sga,
      rnd,
      operating_income: operatingIncome,
      interest_expense: interestExpense,
      income_before_tax: incomeBT,
      tax,
      net_income: netIncome,
      ebitda,
      depreciation,
      capex,
      delta_nwc: deltaNWC,
      fcff,
      timing,
      discount_factor: discountFactor,
      pv_fcff: fcff * discountFactor,
    });
  }

  // Terminal year (Year N+1) — grow all items by g
  const lastProj = projections[numYears - 1];
  const termRevenue = lastProj.revenue * (1 + g);
  const termCOGS = termRevenue * ratios.cogs_pct;
  const termGrossProfit = termRevenue - termCOGS;
  const termSGA = termRevenue * ratios.sga_pct;
  const termRND = termRevenue * ratios.rnd_pct;
  const termOpIncome = termGrossProfit - termSGA - termRND;
  const termInterest = termRevenue * ratios.interest_pct;
  const termIncBT = termOpIncome - termInterest;
  const termTax = Math.max(0, termIncBT * ratios.tax_rate);
  const termNetIncome = termIncBT - termTax;
  const termDepreciation = lastProj.depreciation * (1 + g);
  const termEBITDA = termIncBT + termInterest + termDepreciation;
  const termCapex = termRevenue * capexRatio;
  const termDeltaNWC = lastProj.delta_nwc * (1 + g);
  const termFCFF = termEBITDA - termTax - termCapex - termDeltaNWC;

  const terminalYear: DCFFCFFProjectionYear = {
    year: lastProj.year + 1,
    revenue: termRevenue,
    revenue_growth: g,
    cogs: termCOGS,
    gross_profit: termGrossProfit,
    sga: termSGA,
    rnd: termRND,
    operating_income: termOpIncome,
    interest_expense: termInterest,
    income_before_tax: termIncBT,
    tax: termTax,
    net_income: termNetIncome,
    ebitda: termEBITDA,
    depreciation: termDepreciation,
    capex: termCapex,
    delta_nwc: termDeltaNWC,
    fcff: termFCFF,
    timing: numYears,
    discount_factor: 1 / Math.pow(1 + wacc, numYears),
    pv_fcff: 0,
  };

  const terminalValue = wacc - g >= MIN_DISCOUNT_TERMINAL_SPREAD
    ? termFCFF / (wacc - g)
    : termFCFF * TERMINAL_EXIT_MULTIPLE;

  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, numYears);
  const pvFCFFTotal = projections.reduce((sum, p) => sum + p.pv_fcff, 0);

  const enterpriseValue = pvFCFFTotal + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  const sensitivity = buildFCFFSensitivityMatrix(
    projections, termFCFF, netDebt, sharesOutstanding, wacc, g, numYears
  );
  const allPrices = sensitivity.prices.flat();

  const baseYear = {
    year: lastFinancial.fiscal_year,
    revenue: lastFinancial.revenue,
    cogs: lastFinancial.cost_of_revenue,
    sga: lastFinancial.sga_expense,
    rnd: lastFinancial.rnd_expense,
    interest_expense: lastFinancial.interest_expense,
    tax: lastFinancial.income_tax,
    net_income: lastFinancial.net_income,
    nwc: baseNWC,
  };

  return {
    model_type: numYears === 10 ? "dcf_fcff_growth_10y" : "dcf_fcff_growth_5y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: Math.min(...allPrices),
    high_estimate: Math.max(...allPrices),
    assumptions: {
      wacc: Math.round(wacc * 10000) / 100,
      terminal_growth_rate: Math.round(g * 10000) / 100,
      terminal_method: "perpetuity",
      projection_years: numYears,
      useful_life: usefulLife,
      revenue_growth_rates: revProj.growthRates.map((r) => Math.round(r * 10000) / 100),
      revenue_source: revProj.source,
      cogs_pct_revenue: Math.round(ratios.cogs_pct * 10000) / 100,
      sga_pct_revenue: Math.round(ratios.sga_pct * 10000) / 100,
      rnd_pct_revenue: Math.round(ratios.rnd_pct * 10000) / 100,
      interest_pct_revenue: Math.round(ratios.interest_pct * 10000) / 100,
      effective_tax_rate: Math.round(ratios.tax_rate * 10000) / 100,
      capex_pct_revenue: Math.round(capexRatio * 10000) / 100,
      dso: wcDays.dso,
      dpo: wcDays.dpo,
      dio: wcDays.dio,
      discount_rate: Math.round(wacc * 10000) / 100,
    },
    details: {
      projections,
      terminal_year: terminalYear,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcff_total: pvFCFFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      da_schedule: daSchedule,
      working_capital: wc,
      expense_ratios: ratios,
      base_year: baseYear,
      sensitivity_matrix: sensitivity,
      wacc_raw: wacc,
      terminal_growth_raw: g,
      projection_years: numYears,
    },
    computed_at: new Date().toISOString(),
  };
}

export function calculateDCFFCFF(inputs: DCFFCFFInputs): ValuationResult {
  return calculateFCFFInternal(inputs, 5);
}

export function calculateDCFFCFF10Y(inputs: DCFFCFFInputs): ValuationResult {
  return calculateFCFFInternal(inputs, 10);
}