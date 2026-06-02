/**
 * Shared test fixtures for valuation module tests.
 * Modeled after real Mag 7 data patterns.
 */
import type { FinancialStatement, Company, AnalystEstimate, PeerComparison, HistoricalMultiplesPoint } from "../../types.js";

// --- Apple-like company ---
export const appleCompany: Company = {
  ticker: "TEST",
  name: "Test Corp",
  sector: "Technology",
  industry: "Consumer Electronics",
  market_cap: 3_000_000_000_000,
  beta: 1.2,
  price: 200,
  shares_outstanding: 15_000_000_000,
  exchange: "NASDAQ",
  description: "Test company",
  logo_url: "",
  updated_at: "2025-01-01T00:00:00Z",
  has_valuation: true,
  valuation_tier: "full",
};

export const appleFinancials: FinancialStatement[] = [
  makeFinancial(2025, { revenue: 400e9, net_income: 100e9, ebitda: 140e9, eps: 6.67, eps_diluted: 6.67 }),
  makeFinancial(2024, { revenue: 380e9, net_income: 95e9, ebitda: 135e9, eps: 6.33, eps_diluted: 6.33 }),
  makeFinancial(2023, { revenue: 360e9, net_income: 90e9, ebitda: 128e9, eps: 6.00, eps_diluted: 6.00 }),
  makeFinancial(2022, { revenue: 350e9, net_income: 85e9, ebitda: 120e9, eps: 5.67, eps_diluted: 5.67 }),
  makeFinancial(2021, { revenue: 320e9, net_income: 75e9, ebitda: 110e9, eps: 5.00, eps_diluted: 5.00 }),
];

export const testEstimates: AnalystEstimate[] = [
  { ticker: "TEST", period: "2026", revenue_estimate: 420e9, eps_estimate: 7.0, revenue_low: 400e9, revenue_high: 440e9, eps_low: 6.5, eps_high: 7.5, number_of_analysts: 30 },
  { ticker: "TEST", period: "2027", revenue_estimate: 445e9, eps_estimate: 7.4, revenue_low: 420e9, revenue_high: 470e9, eps_low: 6.8, eps_high: 8.0, number_of_analysts: 25 },
];

export const testPeers: PeerComparison[] = [
  { ticker: "PEER1", name: "Peer One", market_cap: 2e12, trailing_pe: 25, forward_pe: 22, ev_ebitda: 20, forward_ev_ebitda: 17, ev_revenue: 8, forward_ev_revenue: 7.5, price_to_book: 12, price_to_sales: 8, revenue_growth: 0.08, net_margin: 0.22, roe: 0.35 },
  { ticker: "PEER2", name: "Peer Two", market_cap: 1.5e12, trailing_pe: 30, forward_pe: 27, ev_ebitda: 25, forward_ev_ebitda: 21, ev_revenue: 10, forward_ev_revenue: 9, price_to_book: 15, price_to_sales: 10, revenue_growth: 0.12, net_margin: 0.18, roe: 0.28 },
  { ticker: "PEER3", name: "Peer Three", market_cap: 1e12, trailing_pe: 22, forward_pe: 20, ev_ebitda: 18, forward_ev_ebitda: 15, ev_revenue: 6, forward_ev_revenue: 5.5, price_to_book: 8, price_to_sales: 6, revenue_growth: 0.05, net_margin: 0.25, roe: 0.40 },
];

// --- Company with negative earnings ---
export const unprofitableCompany: Company = {
  ...appleCompany,
  ticker: "LOSS",
  name: "Loss Corp",
  industry: "Software",
  valuation_tier: "pre_profit",
};

export const unprofitableFinancials: FinancialStatement[] = [
  makeFinancial(2025, { revenue: 50e9, net_income: -5e9, ebitda: -2e9, eps: -0.5, eps_diluted: -0.5 }),
  makeFinancial(2024, { revenue: 40e9, net_income: -8e9, ebitda: -5e9, eps: -0.8, eps_diluted: -0.8 }),
];

// --- Pre-profit high-growth company (RKLB-like) ---
export const preProfitCompany: Company = {
  ticker: "GROW",
  name: "Growth Rocket Inc",
  sector: "Industrials",
  industry: "Aerospace & Defense",
  market_cap: 39e9,
  beta: 2.2,
  price: 68,
  shares_outstanding: 530_000_000,
  exchange: "NASDAQ",
  description: "Pre-profit high-growth space company",
  logo_url: "",
  updated_at: "2025-01-01T00:00:00Z",
  has_valuation: true,
  valuation_tier: "pre_profit",
};

export const preProfitFinancials: FinancialStatement[] = [
  makeFinancial(2025, { revenue: 600e6, net_income: -198e6, ebitda: -155e6, eps: -0.37, eps_diluted: -0.37, operating_income: -229e6, gross_profit: 207e6, cost_of_revenue: 395e6, sga_expense: 165e6, rnd_expense: 271e6, depreciation_amortization: 44e6, capital_expenditure: -156e6, cash_and_equivalents: 829e6, total_debt: 254e6, accounts_receivable: 123e6, inventory: 158e6, accounts_payable: 73e6 }),
  makeFinancial(2024, { revenue: 436e6, net_income: -190e6, ebitda: -152e6, eps: -0.38, eps_diluted: -0.38, operating_income: -190e6, gross_profit: 116e6, cost_of_revenue: 320e6, sga_expense: 132e6, rnd_expense: 174e6, depreciation_amortization: 34e6, capital_expenditure: -67e6, cash_and_equivalents: 271e6, total_debt: 468e6, accounts_receivable: 112e6, inventory: 119e6, accounts_payable: 53e6 }),
  makeFinancial(2023, { revenue: 245e6, net_income: -183e6, ebitda: -145e6, eps: -0.38, eps_diluted: -0.38, operating_income: -178e6, gross_profit: 51e6, cost_of_revenue: 193e6, sga_expense: 110e6, rnd_expense: 119e6, depreciation_amortization: 30e6, capital_expenditure: -55e6, cash_and_equivalents: 163e6, total_debt: 177e6, accounts_receivable: 62e6, inventory: 108e6, accounts_payable: 29e6 }),
  makeFinancial(2022, { revenue: 211e6, net_income: -136e6, ebitda: -95e6, eps: -0.29, eps_diluted: -0.29, operating_income: -135e6, gross_profit: 19e6, cost_of_revenue: 192e6, sga_expense: 89e6, rnd_expense: 65e6, depreciation_amortization: 30e6, capital_expenditure: -40e6 }),
];

export const preProfitEstimates: AnalystEstimate[] = [
  { ticker: "GROW", period: "2026", revenue_estimate: 871e6, eps_estimate: -0.19, revenue_low: 837e6, revenue_high: 949e6, eps_low: -0.57, eps_high: 0.30, number_of_analysts: 10 },
  { ticker: "GROW", period: "2027", revenue_estimate: 1.21e9, eps_estimate: 0.07, revenue_low: 979e6, revenue_high: 1.40e9, eps_low: -0.47, eps_high: 0.47, number_of_analysts: 10 },
];

export const preProfitPeers: PeerComparison[] = [
  { ticker: "LHX", name: "L3Harris", market_cap: 45e9, trailing_pe: 22, forward_pe: 18, ev_ebitda: 15, forward_ev_ebitda: 13, ev_revenue: 2.5, forward_ev_revenue: 2.3, price_to_book: 3, price_to_sales: 2.3, revenue_growth: 0.05, net_margin: 0.08, roe: 0.12 },
  { ticker: "LMT", name: "Lockheed Martin", market_cap: 120e9, trailing_pe: 18, forward_pe: 16, ev_ebitda: 14, forward_ev_ebitda: 12, ev_revenue: 1.8, forward_ev_revenue: 1.7, price_to_book: 10, price_to_sales: 1.7, revenue_growth: 0.06, net_margin: 0.10, roe: 0.50 },
  { ticker: "NOC", name: "Northrop Grumman", market_cap: 80e9, trailing_pe: 20, forward_pe: 17, ev_ebitda: 16, forward_ev_ebitda: 14, ev_revenue: 2.0, forward_ev_revenue: 1.9, price_to_book: 5, price_to_sales: 2.0, revenue_growth: 0.04, net_margin: 0.09, roe: 0.25 },
];

// --- Historical multiples for 2 years of daily data ---
export function generateHistoricalMultiples(
  days: number,
  basePE: number,
  baseEVEBITDA?: number,
): HistoricalMultiplesPoint[] {
  const result: HistoricalMultiplesPoint[] = [];
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Add some variance
    const noise = Math.sin(i / 30) * 0.15 + Math.cos(i / 60) * 0.1;
    result.push({
      date: date.toISOString().split("T")[0],
      pe: Math.round((basePE * (1 + noise)) * 100) / 100,
      ev_ebitda: baseEVEBITDA ? Math.round((baseEVEBITDA * (1 + noise * 0.7)) * 100) / 100 : null,
    });
  }
  return result;
}

// --- Dividend-paying company (JNJ-like: stable, mature, high payout) ---
export const dividendCompany: Company = {
  ticker: "DIVD",
  name: "Dividend Corp",
  sector: "Healthcare",
  industry: "Pharmaceuticals",
  market_cap: 400_000_000_000,
  beta: 0.7,
  price: 160,
  shares_outstanding: 2_500_000_000,
  exchange: "NYSE",
  description: "Stable dividend payer",
  logo_url: "",
  updated_at: "2025-01-01T00:00:00Z",
  has_valuation: true,
  valuation_tier: "full",
};

export const dividendFinancials: FinancialStatement[] = [
  makeFinancial(2025, { ticker: "DIVD", revenue: 90e9, net_income: 18e9, ebitda: 28e9, eps: 7.2, eps_diluted: 7.2, dividends_paid: -9e9, shares_outstanding: 2_500_000_000, free_cash_flow: 20e9 }),
  makeFinancial(2024, { ticker: "DIVD", revenue: 85e9, net_income: 16.5e9, ebitda: 26e9, eps: 6.6, eps_diluted: 6.6, dividends_paid: -8.25e9, shares_outstanding: 2_500_000_000, free_cash_flow: 18e9 }),
  makeFinancial(2023, { ticker: "DIVD", revenue: 82e9, net_income: 15.5e9, ebitda: 24.5e9, eps: 6.2, eps_diluted: 6.2, dividends_paid: -7.75e9, shares_outstanding: 2_500_000_000, free_cash_flow: 17e9 }),
  makeFinancial(2022, { ticker: "DIVD", revenue: 78e9, net_income: 14e9, ebitda: 22e9, eps: 5.6, eps_diluted: 5.6, dividends_paid: -7e9, shares_outstanding: 2_500_000_000, free_cash_flow: 15.5e9 }),
  makeFinancial(2021, { ticker: "DIVD", revenue: 74e9, net_income: 13e9, ebitda: 20e9, eps: 5.2, eps_diluted: 5.2, dividends_paid: -6.5e9, shares_outstanding: 2_500_000_000, free_cash_flow: 14e9 }),
];

export const dividendEstimates: AnalystEstimate[] = [
  { ticker: "DIVD", period: "2026", revenue_estimate: 94e9, eps_estimate: 7.6, revenue_low: 90e9, revenue_high: 98e9, eps_low: 7.2, eps_high: 8.0, number_of_analysts: 20 },
  { ticker: "DIVD", period: "2027", revenue_estimate: 98e9, eps_estimate: 8.0, revenue_low: 94e9, revenue_high: 102e9, eps_low: 7.5, eps_high: 8.5, number_of_analysts: 15 },
];

// --- Non-dividend-paying company ---
export const noDividendCompany: Company = {
  ...appleCompany,
  ticker: "NODIV",
  name: "No Dividend Corp",
};

export const noDividendFinancials: FinancialStatement[] = [
  makeFinancial(2025, { ticker: "NODIV", revenue: 50e9, net_income: 10e9, dividends_paid: 0 }),
  makeFinancial(2024, { ticker: "NODIV", revenue: 45e9, net_income: 8e9, dividends_paid: 0 }),
  makeFinancial(2023, { ticker: "NODIV", revenue: 40e9, net_income: 6e9, dividends_paid: 0 }),
];

// --- Helper to build FinancialStatement ---
export function makeFinancial(
  year: number,
  overrides: Partial<FinancialStatement>
): FinancialStatement {
  const revenue = overrides.revenue ?? 100e9;
  const netIncome = overrides.net_income ?? 20e9;

  return {
    ticker: "TEST",
    period: `FY${year}`,
    period_type: "annual",
    fiscal_year: year,
    fiscal_quarter: null,
    revenue,
    cost_of_revenue: revenue * 0.55,
    gross_profit: revenue * 0.45,
    sga_expense: revenue * 0.1,
    rnd_expense: revenue * 0.08,
    operating_income: revenue * 0.25,
    interest_expense: 2e9,
    income_before_tax: netIncome * 1.25,
    income_tax: netIncome * 0.25,
    net_income: netIncome,
    ebitda: overrides.ebitda ?? revenue * 0.3,
    eps: overrides.eps ?? netIncome / 15e9,
    eps_diluted: overrides.eps_diluted ?? netIncome / 15e9,
    total_assets: revenue * 3,
    total_liabilities: revenue * 1.5,
    total_equity: revenue * 1.5,
    total_debt: 100e9,
    cash_and_equivalents: 50e9,
    net_debt: 50e9,
    accounts_receivable: revenue * 0.1,
    accounts_payable: revenue * 0.08,
    inventory: revenue * 0.03,
    operating_cash_flow: netIncome * 1.3,
    capital_expenditure: -revenue * 0.04,
    free_cash_flow: netIncome * 1.1,
    depreciation_amortization: revenue * 0.05,
    dividends_paid: -netIncome * 0.2,
    tax_rate: 0.21,
    gross_margin: 0.45,
    operating_margin: 0.25,
    net_margin: netIncome / revenue,
    shares_outstanding: 15_000_000_000,
    ...overrides,
  };
}
