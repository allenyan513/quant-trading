// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// FCFF DCF — Shared builder helpers
// Used by both the Gordon Growth and EBITDA Exit models.
// ============================================================

import type {
  FinancialStatement,
  AnalystEstimate,
  DCFFCFFDASchedule,
  DCFFCFFWorkingCapital,
  DCFFCFFExpenseRatios,
} from "../types.js";
import { avg, projectRevenue } from "./dcf-helpers.js";

export type { DCFFCFFDASchedule, DCFFCFFWorkingCapital, DCFFCFFExpenseRatios };
export { projectRevenue };

// --- Inputs ---

export interface DCFFCFFInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  wacc: number;
  currentPrice: number;
  sharesOutstanding: number;
  cashAndEquivalents: number;
  totalDebt: number;
  terminalGrowthRate?: number;
  usefulLife?: number; // default 5
}

// --- Builders ---

/** Compute historical average expense ratios from recent financials */
export function computeExpenseRatios(recent: FinancialStatement[]): DCFFCFFExpenseRatios {
  const withRevenue = recent.filter((f) => f.revenue > 0);

  const cogsPcts = withRevenue.map((f) => f.cost_of_revenue / f.revenue);
  const sgaPcts = withRevenue.map((f) => f.sga_expense / f.revenue);
  const rndPcts = withRevenue.map((f) => f.rnd_expense / f.revenue);
  const interestPcts = withRevenue.map((f) => f.interest_expense / f.revenue);
  const taxRates = withRevenue
    .filter((f) => f.income_before_tax > 0)
    .map((f) => f.income_tax / f.income_before_tax);

  return {
    cogs_pct: avg(cogsPcts) || 0.5,
    sga_pct: avg(sgaPcts) || 0.05,
    rnd_pct: avg(rndPcts) || 0,
    interest_pct: avg(interestPcts) || 0.02,
    tax_rate: taxRates.length > 0 ? Math.max(0, Math.min(0.5, avg(taxRates))) : 0.21,
  };
}

/** Build D&A vintage matrix from historical + projected CapEx */
export function buildDASchedule(
  historicalCapex: { year: number; capex: number }[],
  projectedCapex: { year: number; capex: number }[],
  projectionYears: number[],
  usefulLife: number
): DCFFCFFDASchedule {
  const allCapex = [...historicalCapex, ...projectedCapex];
  const firstProjYear = projectionYears[0];
  const lastProjYear = projectionYears[projectionYears.length - 1];

  const vintages: DCFFCFFDASchedule["vintages"] = [];

  for (const { year: capexYear, capex } of allCapex) {
    const annualDA = capex / usefulLife;
    const depStartYear = capexYear + 1;
    const depEndYear = capexYear + usefulLife;

    if (depEndYear < firstProjYear || depStartYear > lastProjYear) continue;

    const amounts: number[] = [];
    for (const projYear of projectionYears) {
      if (projYear >= depStartYear && projYear <= depEndYear) {
        amounts.push(annualDA);
      } else {
        amounts.push(0);
      }
    }
    vintages.push({ capex_year: capexYear, amounts });
  }

  const totals = projectionYears.map((_, i) =>
    vintages.reduce((sum, v) => sum + v.amounts[i], 0)
  );

  return { useful_life: usefulLife, vintages, totals };
}

/** Compute working capital turnover days from historical data */
export function computeWorkingCapitalDays(recent: FinancialStatement[]): {
  dso: number;
  dpo: number;
  dio: number;
} {
  const withRevenue = recent.filter((f) => f.revenue > 0);

  const dsoValues = withRevenue
    .filter((f) => f.accounts_receivable > 0)
    .map((f) => (f.accounts_receivable / f.revenue) * 365);

  const dpoValues = withRevenue
    .filter((f) => f.accounts_payable > 0 && f.cost_of_revenue > 0)
    .map((f) => (f.accounts_payable / f.cost_of_revenue) * 365);

  const dioValues = withRevenue
    .filter((f) => f.inventory > 0 && f.cost_of_revenue > 0)
    .map((f) => (f.inventory / f.cost_of_revenue) * 365);

  return {
    dso: dsoValues.length > 0 ? Math.round(avg(dsoValues)) : 45,
    dpo: dpoValues.length > 0 ? Math.round(avg(dpoValues)) : 30,
    dio: dioValues.length > 0 ? Math.round(avg(dioValues)) : 60,
  };
}

/** Build working capital projections from turnover days */
export function buildWorkingCapital(
  years: number[],
  revenues: number[],
  cogsValues: number[],
  dso: number,
  dpo: number,
  dio: number,
  baseNWC: number
): DCFFCFFWorkingCapital {
  const receivables: number[] = [];
  const payables: number[] = [];
  const inventory: number[] = [];
  const nwc: number[] = [];
  const deltaNWC: number[] = [];

  for (let i = 0; i < years.length; i++) {
    const ar = (revenues[i] * dso) / 365;
    const ap = (cogsValues[i] * dpo) / 365;
    const inv = (cogsValues[i] * dio) / 365;
    const currentNWC = ar - ap + inv;

    receivables.push(ar);
    payables.push(ap);
    inventory.push(inv);
    nwc.push(currentNWC);

    const prevNWC = i === 0 ? baseNWC : nwc[i - 1];
    deltaNWC.push(currentNWC - prevNWC);
  }

  return { dso, dpo, dio, years, receivables, payables, inventory, nwc, delta_nwc: deltaNWC };
}