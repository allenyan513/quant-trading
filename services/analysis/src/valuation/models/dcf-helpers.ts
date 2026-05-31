// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// DCF Shared Helpers
// Math utilities and revenue projection used by all DCF models
// ============================================================

import type { FinancialStatement, AnalystEstimate } from "../types.js";
import { MIN_GROWTH_RATE, MAX_GROWTH_RATE } from "../constants.js";

// --- Math Helpers ---

/** Calculate CAGR between two values over n years */
export function cagr(startValue: number, endValue: number, years: number): number {
  // Guard NaN/Infinity first: `NaN <= 0` is false, so a bare `<= 0` check would
  // let a non-finite input slip through and poison every downstream projection.
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || !Number.isFinite(years)) return 0;
  if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** Average of an array */
export function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Clamp a value between min and max */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// --- Revenue Projection ---

export interface RevenueProjection {
  years: number[];
  revenues: number[];
  growthRates: number[];
  source: string; // "analyst" | "trend"
}

/**
 * Project future revenue using analyst estimates (if available) + trend extrapolation.
 */
export function projectRevenue(
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[],
  projectionYears: number
): RevenueProjection {
  // Sort historicals ascending by year
  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length === 0) {
    throw new Error("No historical revenue data available");
  }

  const lastYear = sorted[sorted.length - 1].fiscal_year;
  const lastRevenue = sorted[sorted.length - 1].revenue;

  // Calculate historical CAGR (use last 5 years or all available)
  const yearsForCAGR = Math.min(sorted.length - 1, 5);
  const historicalCAGR =
    yearsForCAGR > 0
      ? cagr(sorted[sorted.length - 1 - yearsForCAGR].revenue, lastRevenue, yearsForCAGR)
      : 0.05;

  // Sort estimates by period (ascending)
  const sortedEstimates = [...estimates].sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  const years: number[] = [];
  const revenues: number[] = [];
  const growthRates: number[] = [];
  let source = "trend";
  let prevRevenue = lastRevenue;

  for (let i = 1; i <= projectionYears; i++) {
    const year = lastYear + i;
    years.push(year);

    // Try analyst estimate first
    const estimate = sortedEstimates.find(
      (e) => parseInt(e.period) === year || e.period === String(year)
    );

    let revenue: number;
    let growthRate: number;

    if (estimate && estimate.revenue_estimate > 0) {
      revenue = estimate.revenue_estimate;
      growthRate = (revenue - prevRevenue) / prevRevenue;
      source = "analyst";
    } else {
      // Fade growth rate towards long-term average (GDP-like, ~3%)
      const fadeYears = i - sortedEstimates.length; // years beyond analyst coverage
      if (fadeYears > 0) {
        const fadeFactor = Math.max(0, 1 - fadeYears / (projectionYears - sortedEstimates.length + 1));
        growthRate = historicalCAGR * fadeFactor + 0.03 * (1 - fadeFactor);
      } else {
        growthRate = historicalCAGR;
      }
      // Clamp growth rate
      growthRate = clamp(growthRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
      revenue = prevRevenue * (1 + growthRate);
    }

    revenues.push(revenue);
    growthRates.push(growthRate);
    prevRevenue = revenue;
  }

  return { years, revenues, growthRates, source };
}