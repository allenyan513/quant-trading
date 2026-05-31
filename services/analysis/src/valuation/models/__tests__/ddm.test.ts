import { describe, it, expect } from "vitest";
import { calculateDDM, type DDMInputs, type DDMDetails } from "../ddm.js";
import {
  dividendFinancials,
  dividendEstimates,
  noDividendFinancials,
  appleFinancials,
  makeFinancial,
} from "./fixtures.js";

// --- Shared defaults ---
const BASE_INPUTS: DDMInputs = {
  historicals: dividendFinancials,
  costOfEquity: 0.09,
  terminalGrowthRate: 0.025,
  currentPrice: 160,
  sharesOutstanding: 2_500_000_000,
  estimates: dividendEstimates,
  marketCap: 400e9,
};

function details(result: ReturnType<typeof calculateDDM>): DDMDetails {
  return result.details as unknown as DDMDetails;
}

describe("calculateDDM", () => {
  // --- Normal dividend-paying company ---
  describe("normal dividend payer", () => {
    const result = calculateDDM(BASE_INPUTS);

    it("returns positive fair value", () => {
      expect(result.fair_value).toBeGreaterThan(0);
      expect(result.model_type).toBe("ddm");
    });

    it("computes reasonable fair value range", () => {
      // DPS = 9B / 2.5B = $3.60, with ~8% growth and ~9% Ke → fair value should be high
      expect(result.fair_value).toBeGreaterThan(30);
      expect(result.fair_value).toBeLessThan(500);
    });

    it("has correct upside calculation", () => {
      const expectedUpside = ((result.fair_value - 160) / 160) * 100;
      expect(result.upside_percent).toBeCloseTo(expectedUpside, 0);
    });

    it("provides low and high estimates", () => {
      expect(result.low_estimate).toBeGreaterThan(0);
      expect(result.high_estimate).toBeGreaterThan(result.low_estimate);
      expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
      expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
    });

    it("populates details correctly", () => {
      const d = details(result);
      expect(d.current_dps).toBeCloseTo(3.60, 1);
      expect(d.projections).toHaveLength(5);
      expect(d.pv_dividends).toBeGreaterThan(0);
      expect(d.pv_terminal).toBeGreaterThan(0);
      expect(d.terminal_value).toBeGreaterThan(0);
      expect(d.cost_of_equity).toBe(0.09);
    });

    it("computes dividend metrics", () => {
      const d = details(result);
      expect(d.dividend_yield).toBeGreaterThan(0);
      expect(d.payout_ratio).toBeCloseTo(0.5, 1); // 9B / 18B = 50%
      expect(d.dividend_coverage).toBeCloseTo(2.0, 1); // 18B / 9B
    });

    it("builds historical DPS series", () => {
      const d = details(result);
      expect(d.historical_dps.length).toBeGreaterThanOrEqual(5);
      // DPS should be increasing
      const dpsSeries = d.historical_dps.filter(h => h.dps > 0);
      for (let i = 1; i < dpsSeries.length; i++) {
        expect(dpsSeries[i].dps).toBeGreaterThanOrEqual(dpsSeries[i - 1].dps);
      }
    });

    it("records growth source", () => {
      const d = details(result);
      // Has both DPS history and analyst estimates → should be blended
      expect(d.growth_source).toBe("blended");
      expect(d.dps_cagr).not.toBeNull();
      expect(d.analyst_eps_growth).not.toBeNull();
    });
  });

  // --- Projections are discounted correctly ---
  it("discount factors decrease over time", () => {
    const result = calculateDDM(BASE_INPUTS);
    const d = details(result);
    for (let i = 1; i < d.projections.length; i++) {
      expect(d.projections[i].discount_factor).toBeLessThan(d.projections[i - 1].discount_factor);
    }
  });

  it("PV of dividends + PV of terminal ≈ fair value", () => {
    const result = calculateDDM(BASE_INPUTS);
    const d = details(result);
    const sum = d.pv_dividends + d.pv_terminal;
    expect(result.fair_value).toBeCloseTo(sum, 1);
  });

  // --- Non-dividend company returns N/A ---
  it("returns fair_value=0 for non-dividend company", () => {
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: noDividendFinancials,
    });
    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
    expect(String(result.assumptions.note)).toContain("never paid dividends");
  });

  // --- Unprofitable company with dividends ---
  it("returns fair_value=0 for unprofitable company paying dividends", () => {
    // Make a company that is unprofitable but still paying dividends
    const unprofitableDividendFinancials = [
      makeFinancial(2025, { revenue: 50e9, net_income: -5e9, dividends_paid: -2e9, eps: -0.5, eps_diluted: -0.5 }),
      makeFinancial(2024, { revenue: 45e9, net_income: -3e9, dividends_paid: -2e9, eps: -0.3, eps_diluted: -0.3 }),
      makeFinancial(2023, { revenue: 40e9, net_income: 2e9, dividends_paid: -2e9, eps: 0.2, eps_diluted: 0.2 }),
    ];
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: unprofitableDividendFinancials,
    });
    expect(result.fair_value).toBe(0);
    expect(String(result.assumptions.note)).toContain("unprofitable");
  });

  // --- Cost of Equity ≤ terminal growth ---
  it("returns fair_value=0 when Ke ≤ terminal growth", () => {
    const result = calculateDDM({
      ...BASE_INPUTS,
      costOfEquity: 0.02, // less than terminal growth of 2.5%
    });
    expect(result.fair_value).toBe(0);
    expect(String(result.assumptions.note)).toContain("must exceed terminal growth");
  });

  // --- Insufficient data ---
  it("returns fair_value=0 with only 1 year of data", () => {
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: [dividendFinancials[0]],
    });
    expect(result.fair_value).toBe(0);
    expect(String(result.assumptions.note)).toContain("Insufficient");
  });

  // --- Sensitivity matrix ---
  describe("sensitivity matrix", () => {
    const result = calculateDDM(BASE_INPUTS);
    const d = details(result);

    it("has 5×5 dimensions", () => {
      expect(d.sensitivity_matrix.ke_values).toHaveLength(5);
      expect(d.sensitivity_matrix.growth_values).toHaveLength(5);
      expect(d.sensitivity_matrix.prices).toHaveLength(5);
      d.sensitivity_matrix.prices.forEach(row => {
        expect(row).toHaveLength(5);
      });
    });

    it("fair value decreases as Ke increases (same growth column)", () => {
      const midCol = 2; // middle column
      const prices = d.sensitivity_matrix.prices.map(row => row[midCol]).filter(p => p > 0);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
      }
    });

    it("fair value increases as growth increases (same Ke row)", () => {
      const midRow = 2; // middle row
      const prices = d.sensitivity_matrix.prices[midRow].filter(p => p > 0);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });
  });

  // --- Historical-only growth source (no analyst estimates) ---
  it("uses historical DPS CAGR when no estimates available", () => {
    const result = calculateDDM({
      ...BASE_INPUTS,
      estimates: undefined,
    });
    expect(result.fair_value).toBeGreaterThan(0);
    const d = details(result);
    expect(d.growth_source).toBe("historical_dps_cagr");
  });

  // --- GDP fallback growth ---
  it("uses GDP fallback when insufficient DPS history and no estimates", () => {
    // Only 2 years of dividends (below MIN_YEARS_FOR_CAGR of 3)
    const shortHistory = [
      makeFinancial(2025, { revenue: 10e9, net_income: 2e9, dividends_paid: -500e6 }),
      makeFinancial(2024, { revenue: 9e9, net_income: 1.8e9, dividends_paid: -450e6 }),
    ];
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: shortHistory,
      estimates: undefined,
    });
    expect(result.fair_value).toBeGreaterThan(0);
    const d = details(result);
    expect(d.growth_source).toBe("gdp_fallback");
    expect(d.near_term_growth).toBeCloseTo(0.03, 2);
  });

  // --- Existing Apple fixture (has 20% dividend payout) ---
  it("works with default Apple fixture (low payout)", () => {
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: appleFinancials,
      currentPrice: 200,
      sharesOutstanding: 15_000_000_000,
      marketCap: 3_000_000_000_000,
    });
    // Apple fixture has dividends_paid: -netIncome * 0.2
    expect(result.fair_value).toBeGreaterThan(0);
    const d = details(result);
    expect(d.payout_ratio).toBeCloseTo(0.2, 1);
  });

  // --- Dividends discontinued ---
  it("returns N/A when dividends were discontinued", () => {
    const discontinued = [
      makeFinancial(2025, { revenue: 10e9, net_income: 2e9, dividends_paid: 0 }),
      makeFinancial(2024, { revenue: 9e9, net_income: 1.8e9, dividends_paid: 0 }),
      makeFinancial(2023, { revenue: 8e9, net_income: 1.5e9, dividends_paid: -400e6 }),
      makeFinancial(2022, { revenue: 7e9, net_income: 1.2e9, dividends_paid: -350e6 }),
    ];
    const result = calculateDDM({
      ...BASE_INPUTS,
      historicals: discontinued,
    });
    expect(result.fair_value).toBe(0);
    expect(String(result.assumptions.note)).toContain("discontinued");
  });
});
