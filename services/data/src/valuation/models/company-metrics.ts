// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Company Classification Metrics
// Computes financial metrics used to classify a company's archetype.
// ============================================================

import type { FinancialStatement, Company, AnalystEstimate } from "../types.js";

export interface ClassificationMetrics {
  revenueCAGR: number;
  /** Recent revenue trajectory (≈2y CAGR). A 5y endpoint CAGR can read "high"
   *  long after growth has stalled (a former hyper-grower that plateaued); this
   *  captures whether growth is *still* happening. */
  recentRevenueGrowth: number;
  netIncomeCAGR: number;
  latestNetMargin: number;
  avgNetMargin: number;
  latestEPS: number;
  dividendYield: number;
  revenueVolatility: number;
  earningsVolatility: number;
  isCurrentlyProfitable: boolean;
  isProfitImproving: boolean;
  assetIntensity: number;
  debtToEquity: number;
  fcfYield: number;
  analystGrowth: number | null;
}

export function computeClassificationMetrics(
  company: Company,
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[]
): ClassificationMetrics {
  const sorted = [...historicals]
    .filter((f) => f.period_type === "annual" && f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  // Guard: no usable financial data — return zero metrics
  if (sorted.length === 0) {
    return {
      revenueCAGR: 0, recentRevenueGrowth: 0, netIncomeCAGR: 0, latestNetMargin: 0, avgNetMargin: 0,
      latestEPS: 0, dividendYield: 0, revenueVolatility: 0, earningsVolatility: 0,
      isCurrentlyProfitable: false, isProfitImproving: false, assetIntensity: 0,
      debtToEquity: 0, fcfYield: 0, analystGrowth: null,
    };
  }

  const latest = sorted[sorted.length - 1];
  const years = Math.min(sorted.length - 1, 5);

  const revenueCAGR =
    years > 0 && sorted[sorted.length - 1 - years].revenue > 0
      ? Math.pow(
          latest.revenue / sorted[sorted.length - 1 - years].revenue,
          1 / years
        ) - 1
      : 0;

  const startNI = sorted[sorted.length - 1 - Math.min(years, sorted.length - 1)].net_income;
  const endNI = latest.net_income;
  const netIncomeCAGR =
    startNI > 0 && endNI > 0 && years > 0
      ? Math.pow(endNI / startNI, 1 / years) - 1
      : 0;

  const latestNetMargin = latest.revenue > 0 ? latest.net_income / latest.revenue : 0;
  const margins = sorted
    .filter((f) => f.revenue > 0)
    .map((f) => f.net_income / f.revenue);
  const avgNetMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;

  const latestEPS = latest.eps_diluted || latest.eps || 0;

  const totalDividends = Math.abs(latest.dividends_paid || 0);
  const marketCap = company.market_cap || company.price * company.shares_outstanding;
  const dividendYield = marketCap > 0 ? totalDividends / marketCap : 0;

  const revGrowths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].revenue > 0) {
      revGrowths.push((sorted[i].revenue - sorted[i - 1].revenue) / sorted[i - 1].revenue);
    }
  }
  // Recent trajectory: ≈2y CAGR (last 3 annual points) to smooth a single noisy
  // year; fall back to the latest YoY, then the long-run CAGR.
  const recentRevenueGrowth =
    sorted.length >= 3 && sorted[sorted.length - 3].revenue > 0
      ? Math.pow(latest.revenue / sorted[sorted.length - 3].revenue, 1 / 2) - 1
      : revGrowths.length > 0
        ? revGrowths[revGrowths.length - 1]
        : revenueCAGR;

  const revMean = revGrowths.length > 0 ? revGrowths.reduce((a, b) => a + b, 0) / revGrowths.length : 0;
  const revStd = revGrowths.length > 1
    ? Math.sqrt(revGrowths.reduce((s, g) => s + (g - revMean) ** 2, 0) / (revGrowths.length - 1))
    : 0;
  const revenueVolatility = Math.abs(revMean) > 0.01 ? revStd / Math.abs(revMean) : revStd;

  const earningsGrowths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].net_income !== 0) {
      earningsGrowths.push(
        (sorted[i].net_income - sorted[i - 1].net_income) / Math.abs(sorted[i - 1].net_income)
      );
    }
  }
  const eMean = earningsGrowths.length > 0 ? earningsGrowths.reduce((a, b) => a + b, 0) / earningsGrowths.length : 0;
  const eStd = earningsGrowths.length > 1
    ? Math.sqrt(earningsGrowths.reduce((s, g) => s + (g - eMean) ** 2, 0) / (earningsGrowths.length - 1))
    : 0;
  const earningsVolatility = Math.abs(eMean) > 0.01 ? eStd / Math.abs(eMean) : eStd;

  const isCurrentlyProfitable = latest.net_income > 0
    || (latest.operating_income != null && latest.operating_income > 0);
  const recentMargins = sorted.slice(-3).map((f) => f.revenue > 0 ? f.net_income / f.revenue : 0);
  const isProfitImproving =
    recentMargins.length >= 2 &&
    recentMargins[recentMargins.length - 1] > recentMargins[0];

  const assetIntensity = latest.revenue > 0 ? latest.total_assets / latest.revenue : 2;
  const debtToEquity = latest.total_equity > 0 ? latest.total_debt / latest.total_equity : 5;
  const fcfYield = marketCap > 0 ? latest.free_cash_flow / marketCap : 0;

  const sortedEst = [...estimates].sort((a, b) => a.period.localeCompare(b.period));
  let analystGrowth: number | null = null;
  if (sortedEst.length > 0 && latest.revenue > 0) {
    const nextRevenue = sortedEst[0].revenue_estimate;
    if (nextRevenue > 0) {
      analystGrowth = (nextRevenue - latest.revenue) / latest.revenue;
    }
  }

  return {
    revenueCAGR,
    recentRevenueGrowth,
    netIncomeCAGR,
    latestNetMargin,
    avgNetMargin,
    latestEPS,
    dividendYield,
    revenueVolatility,
    earningsVolatility,
    isCurrentlyProfitable,
    isProfitImproving,
    assetIntensity,
    debtToEquity,
    fcfYield,
    analystGrowth,
  };
}