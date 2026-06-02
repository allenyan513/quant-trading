import { describe, it, expect } from "vitest";
import { calculateEPV, type EPVInputs, type EPVDetails } from "../epv.js";
import type { FinancialStatement } from "../../types.js";
import { appleFinancials, makeFinancial } from "./fixtures.js";

const baseInputs: EPVInputs = {
  historicals: appleFinancials,
  wacc: 0.09,
  currentPrice: 200,
  sharesOutstanding: 15_000_000_000,
  netDebt: 50e9,
};

describe("calculateEPV", () => {
  it("returns a valid EPV result for a profitable company", () => {
    const result = calculateEPV(baseInputs);

    expect(result.model_type).toBe("epv");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.low_estimate).toBeGreaterThan(0);
    expect(result.high_estimate).toBeGreaterThan(0);
    expect(result.low_estimate).toBeLessThan(result.fair_value);
    expect(result.high_estimate).toBeGreaterThan(result.fair_value);
    expect(typeof result.upside_percent).toBe("number");
  });

  it("computes correct normalized earnings pipeline", () => {
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    // Sustainable revenue = latest year
    expect(d.sustainable_revenue).toBe(appleFinancials[0].revenue);

    // Sustainable gross margin = average of 5Y margins
    expect(d.sustainable_gross_margin).toBeGreaterThan(0);
    expect(d.sustainable_gross_margin).toBeLessThan(1);

    // Sustainable gross profit = revenue × margin
    expect(d.sustainable_gross_profit).toBeCloseTo(
      d.sustainable_revenue * d.sustainable_gross_margin,
      0
    );

    // Normalized EBIT = gross profit - maintenance opex
    expect(d.normalized_ebit).toBe(d.sustainable_gross_profit - d.maintenance_opex);

    // After-tax normalized EBIT
    expect(d.after_tax_normalized_ebit).toBeCloseTo(
      d.normalized_ebit * (1 - d.avg_tax_rate),
      0
    );

    // Normalized earnings = after-tax EBIT - max(0, avg capex-DA)
    const expectedNE = d.after_tax_normalized_ebit - Math.max(0, d.avg_capex_minus_da);
    expect(d.normalized_earnings).toBeCloseTo(expectedNE, 0);
  });

  it("computes enterprise value as normalized earnings / WACC", () => {
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    expect(d.enterprise_value).toBeCloseTo(d.normalized_earnings / d.wacc, 0);
  });

  it("derives fair value from equity value / shares", () => {
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    const expectedFV = (d.enterprise_value - d.net_debt) / d.shares_outstanding;
    expect(result.fair_value).toBeCloseTo(expectedFV, 2);
  });

  it("returns N/A (fair_value=0) for companies with negative normalized earnings", () => {
    // Build financials where OpEx >> gross profit, so EBIT is negative
    const base = makeFinancial(2025, { revenue: 50e9 });
    const negEBIT: FinancialStatement[] = [
      { ...base, fiscal_year: 2025, revenue: 50e9, gross_profit: 5e9, cost_of_revenue: 45e9, sga_expense: 20e9, rnd_expense: 15e9 },
      { ...base, fiscal_year: 2024, revenue: 40e9, gross_profit: 4e9, cost_of_revenue: 36e9, sga_expense: 18e9, rnd_expense: 12e9 },
    ];

    const result = calculateEPV({
      ...baseInputs,
      historicals: negEBIT,
    });

    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
  });

  it("returns N/A when insufficient data (< 2 years)", () => {
    const result = calculateEPV({
      ...baseInputs,
      historicals: [appleFinancials[0]],
    });

    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
  });

  it("uses WACC band for low/high estimates", () => {
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    // Low uses higher WACC, high uses lower WACC
    expect(d.wacc_high).toBeGreaterThan(d.wacc);
    expect(d.wacc_low).toBeLessThan(d.wacc);
    expect(d.enterprise_value_low).toBeLessThan(d.enterprise_value);
    expect(d.enterprise_value_high).toBeGreaterThan(d.enterprise_value);
  });

  it("handles high net debt exceeding enterprise value", () => {
    const result = calculateEPV({
      ...baseInputs,
      netDebt: 1e15, // absurdly high debt
    });

    // Should return N/A since equity value would be negative
    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
  });

  it("correctly handles negative capex values (stored as negative in financials)", () => {
    // makeFinancial stores capex as negative (e.g., -revenue * 0.04)
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    // All capex in historical should be positive (absolute value)
    d.historical.forEach((h) => {
      expect(h.capex).toBeGreaterThanOrEqual(0);
    });
  });

  it("includes correct number of historical years", () => {
    const result = calculateEPV(baseInputs);
    const d = result.details as unknown as EPVDetails;

    expect(d.historical).toHaveLength(5);
    // Should be sorted descending
    expect(d.historical[0].year).toBeGreaterThan(d.historical[4].year);
  });

  it("works with exactly 2 years of data", () => {
    const twoYears = appleFinancials.slice(0, 2);
    const result = calculateEPV({
      ...baseInputs,
      historicals: twoYears,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    const d = result.details as unknown as EPVDetails;
    expect(d.historical).toHaveLength(2);
  });
});
