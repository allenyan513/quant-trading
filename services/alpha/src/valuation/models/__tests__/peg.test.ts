import { describe, it, expect } from "vitest";
import { calculatePEG, type PEGDetails } from "../peg.js";
import { appleFinancials, testEstimates, unprofitableFinancials, makeFinancial } from "./fixtures.js";

function getDetails(result: { details: Record<string, unknown> }): PEGDetails {
  return result.details as unknown as PEGDetails;
}

describe("calculatePEG", () => {
  // ---- Core formula ----

  it("should compute fair value = fair_pe × eps_used", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    expect(result.model_type).toBe("peg");
    expect(result.fair_value).toBeGreaterThan(0);

    const d = getDetails(result);
    expect(result.fair_value).toBeCloseTo(d.fair_pe * d.eps_used, 0);
  });

  it("should use forward growth when estimates are available", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
      estimates: testEstimates,
    });

    const d = getDetails(result);
    expect(d.growth_source).toBe("forward");
    expect(d.forward_growth).not.toBeNull();
    expect(d.ntm_eps).not.toBeNull();
    // NTM EPS should be used
    expect(d.eps_used).toBe(d.ntm_eps);
  });

  it("should fall back to historical growth without estimates", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const d = getDetails(result);
    expect(d.growth_source).toBe("historical");
    expect(d.ntm_eps).toBeNull();
    // TTM EPS should be used
    expect(d.eps_used).toBe(d.ttm_eps);
  });

  it("should use EPS CAGR (not net income CAGR) for historical growth", () => {
    // Company with growing EPS but flat net income (buyback effect)
    const buybackCompany = [
      makeFinancial(2021, { net_income: 50e9, eps: 3.0, eps_diluted: 3.0, shares_outstanding: 16.7e9 }),
      makeFinancial(2022, { net_income: 50e9, eps: 3.3, eps_diluted: 3.3, shares_outstanding: 15.2e9 }),
      makeFinancial(2023, { net_income: 50e9, eps: 3.6, eps_diluted: 3.6, shares_outstanding: 13.9e9 }),
      makeFinancial(2024, { net_income: 50e9, eps: 4.0, eps_diluted: 4.0, shares_outstanding: 12.5e9 }),
    ];

    const result = calculatePEG({
      historicals: buybackCompany,
      currentPrice: 100,
    });

    const d = getDetails(result);
    // EPS grew from 3.0 to 4.0 over 3 years → ~10% CAGR
    // Net income was flat → old model would give 0% CAGR
    expect(d.raw_growth_rate).toBeGreaterThan(0.09);
    expect(d.raw_growth_rate).toBeLessThan(0.12);
  });

  // ---- Growth clamping ----

  it("should clamp growth rate between 8% and 25%", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const d = getDetails(result);
    expect(d.growth_rate).toBeGreaterThanOrEqual(0.08);
    expect(d.growth_rate).toBeLessThanOrEqual(0.25);
  });

  it("should clamp very high growth to 25% ceiling", () => {
    const highGrowth = [
      makeFinancial(2023, { net_income: 1e9, eps: 1.0, eps_diluted: 1.0 }),
      makeFinancial(2024, { net_income: 10e9, eps: 5.0, eps_diluted: 5.0 }),
    ];

    const result = calculatePEG({
      historicals: highGrowth,
      currentPrice: 100,
    });

    const d = getDetails(result);
    expect(d.growth_rate).toBe(0.25);
    expect(d.growth_clamped).toBe(true);
  });

  it("should use 8% floor for low/negative growth", () => {
    const flatGrowth = [
      makeFinancial(2023, { net_income: 50e9, eps: 5.0, eps_diluted: 5.0 }),
      makeFinancial(2024, { net_income: 50e9, eps: 5.0, eps_diluted: 5.0 }),
    ];

    const result = calculatePEG({
      historicals: flatGrowth,
      currentPrice: 100,
    });

    const d = getDetails(result);
    expect(d.growth_rate).toBe(0.08); // 8% floor
    expect(d.growth_clamped).toBe(true);
  });

  // ---- Dividend yield ----

  it("should include dividend yield in adjusted growth", () => {
    const withDividends = [
      makeFinancial(2023, {
        net_income: 50e9, eps: 5.0, eps_diluted: 5.0,
        dividends_paid: -10e9, shares_outstanding: 10e9,
      }),
      makeFinancial(2024, {
        net_income: 55e9, eps: 5.5, eps_diluted: 5.5,
        dividends_paid: -11e9, shares_outstanding: 10e9,
      }),
    ];

    const result = calculatePEG({
      historicals: withDividends,
      currentPrice: 100,
      marketCap: 1000e9, // $100 price × 10B shares
    });

    const d = getDetails(result);
    // Dividend yield = 11B / 1000B = 1.1%
    expect(d.dividend_yield).toBeCloseTo(0.011, 2);
    expect(d.adjusted_growth).toBeGreaterThan(d.raw_growth_rate);
  });

  // ---- Single-point model ----

  it("should set low and high equal to fair value (single-point model)", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    expect(result.low_estimate).toBe(result.fair_value);
    expect(result.high_estimate).toBe(result.fair_value);
  });

  // ---- PEG ratio ----

  it("should compute PEG ratio", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const d = getDetails(result);
    expect(d.peg_ratio).not.toBeNull();
    expect(d.current_pe).not.toBeNull();
    // PEG = current P/E ÷ (adjusted growth × 100)
    if (d.peg_ratio && d.current_pe) {
      expect(d.peg_ratio).toBeCloseTo(d.current_pe / (d.adjusted_growth * 100), 1);
    }
  });

  // ---- Edge cases ----

  it("should return N/A for negative EPS", () => {
    const result = calculatePEG({
      historicals: unprofitableFinancials,
      currentPrice: 50,
    });

    expect(result.fair_value).toBe(0);
    expect((result.assumptions as Record<string, unknown>).note).toContain("N/A");
  });

  it("should return N/A with insufficient data (< 2 years)", () => {
    const result = calculatePEG({
      historicals: [appleFinancials[0]],
      currentPrice: 200,
    });

    expect(result.fair_value).toBe(0);
  });

  it("should return N/A for empty historicals", () => {
    const result = calculatePEG({
      historicals: [],
      currentPrice: 200,
    });

    expect(result.fair_value).toBe(0);
  });

  it("should use average YoY growth when start EPS is negative", () => {
    const mixedFinancials = [
      makeFinancial(2021, { net_income: -10e9, eps: -1.0, eps_diluted: -1.0 }),
      makeFinancial(2022, { net_income: 20e9, eps: 3.0, eps_diluted: 3.0 }),
      makeFinancial(2023, { net_income: 25e9, eps: 4.0, eps_diluted: 4.0 }),
      makeFinancial(2024, { net_income: 30e9, eps: 5.0, eps_diluted: 5.0 }),
    ];

    const result = calculatePEG({
      historicals: mixedFinancials,
      currentPrice: 100,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    const d = getDetails(result);
    expect(d.growth_source).toBe("historical");
  });

  it("should handle all-negative net income with positive EPS gracefully", () => {
    const edgeCase = [
      makeFinancial(2023, { net_income: -5e9, eps: 1.5, eps_diluted: 1.5 }),
      makeFinancial(2024, { net_income: -3e9, eps: 2.0, eps_diluted: 2.0 }),
    ];

    const result = calculatePEG({
      historicals: edgeCase,
      currentPrice: 50,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    const d = getDetails(result);
    // EPS grew from 1.5 to 2.0 = 33% — capped at 25%
    expect(d.growth_rate).toBeLessThanOrEqual(0.25);
  });

  it("should use only 2 years when only 2 available", () => {
    const twoYears = [
      makeFinancial(2023, { net_income: 50e9, eps: 3.0, eps_diluted: 3.0 }),
      makeFinancial(2024, { net_income: 55e9, eps: 3.5, eps_diluted: 3.5 }),
    ];

    const result = calculatePEG({
      historicals: twoYears,
      currentPrice: 100,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    const d = getDetails(result);
    expect(d.years_used).toBe(1);
  });

  it("should include earnings history with EPS-based YoY growth", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const d = getDetails(result);
    expect(d.earnings_history.length).toBe(appleFinancials.length);
    expect(d.earnings_history[0].yoy_growth).toBeNull(); // First year
    expect(d.earnings_history[1].yoy_growth).not.toBeNull();
  });

  it("should compute upside correctly", () => {
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const expectedUpside = ((result.fair_value - 200) / 200) * 100;
    expect(result.upside_percent).toBeCloseTo(expectedUpside, 1);
  });

  // ---- Forward estimates filtering ----

  it("should skip estimates with fewer than 3 analysts", () => {
    const weakEstimates = [
      { ticker: "TEST", period: "2026", eps_estimate: 7.0, revenue_estimate: 420e9,
        revenue_low: 400e9, revenue_high: 440e9, eps_low: 6.5, eps_high: 7.5,
        number_of_analysts: 2 }, // Too few
    ];

    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
      estimates: weakEstimates,
    });

    const d = getDetails(result);
    expect(d.growth_source).toBe("historical"); // Falls back
  });
});
