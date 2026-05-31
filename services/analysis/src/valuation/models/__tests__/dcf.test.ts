import { describe, it, expect } from "vitest";
import { calculateDCF, type DCFFCFEInputs } from "../dcf.js";
import { appleFinancials, testEstimates } from "./fixtures.js";

describe("calculateDCF", () => {
  const baseInputs: DCFFCFEInputs = {
    historicals: appleFinancials,
    estimates: testEstimates,
    costOfEquity: 0.10,
    currentPrice: 200,
    sharesOutstanding: 15_000_000_000,
    cashAndEquivalents: 50e9,
    totalDebt: 100e9,
  };

  it("should return a valid DCF result with positive fair value", () => {
    const result = calculateDCF(baseInputs, 5);

    expect(result.model_type).toBe("dcf_growth_exit_5y");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.computed_at).toBeTruthy();
  });

  it("should include revenue growth rates in assumptions", () => {
    const result = calculateDCF(baseInputs, 5);
    const rates = result.assumptions.revenue_growth_rates as number[];

    expect(rates).toHaveLength(5);
    // Rates should be in percentage form (e.g., 5.0 for 5%)
    rates.forEach((r) => {
      expect(r).toBeGreaterThan(-15);
      expect(r).toBeLessThan(35);
    });
  });

  it("should use analyst estimates when available", () => {
    const result = calculateDCF(baseInputs, 5);
    expect(result.assumptions.revenue_source).toBe("analyst");
  });

  it("should use trend when no analyst estimates", () => {
    const result = calculateDCF(
      { ...baseInputs, estimates: [] },
      5
    );
    expect(result.assumptions.revenue_source).toBe("trend");
  });

  it("should compute low and high from sensitivity matrix", () => {
    const result = calculateDCF(baseInputs, 5);

    expect(result.low_estimate).toBeGreaterThan(0);
    expect(result.high_estimate).toBeGreaterThan(0);
    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
  });

  it("should compute upside percent correctly", () => {
    const result = calculateDCF(baseInputs, 5);
    const expectedUpside =
      ((result.fair_value - 200) / 200) * 100;
    expect(result.upside_percent).toBeCloseTo(expectedUpside, 1);
  });

  it("should produce 5 projection years", () => {
    const result = calculateDCF(baseInputs, 5);
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<Record<string, number>>;

    expect(projections).toHaveLength(5);
    // Each projection year should have positive revenue
    projections.forEach((p) => {
      expect(p.revenue).toBeGreaterThan(0);
    });
  });

  it("should include terminal value in details", () => {
    const result = calculateDCF(baseInputs, 5);
    const details = result.details as Record<string, unknown>;

    expect(details.terminal_value).toBeGreaterThan(0);
    expect(details.pv_terminal_value).toBeGreaterThan(0);
    expect(details.equity_value).toBeDefined();
  });

  it("should include sensitivity matrix with 5x5 grid", () => {
    const result = calculateDCF(baseInputs, 5);
    const details = result.details as Record<string, unknown>;
    const matrix = details.sensitivity_matrix as {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };

    expect(matrix.discount_rate_values).toHaveLength(5);
    expect(matrix.growth_values).toHaveLength(5);
    expect(matrix.prices).toHaveLength(5);
    matrix.prices.forEach((row) => {
      expect(row).toHaveLength(5);
      row.forEach((price) => {
        expect(price).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("should clamp fair value at 0 (never negative)", () => {
    // Very high cost of equity + high debt = potentially negative equity value
    const result = calculateDCF(
      {
        ...baseInputs,
        costOfEquity: 0.5,
        totalDebt: 5000e9,
        cashAndEquivalents: 0,
      },
      5
    );
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
  });

  it("should throw when no historical revenue data", () => {
    expect(() =>
      calculateDCF(
        { ...baseInputs, historicals: [] },
        5
      )
    ).toThrow("No historical revenue data");
  });

  it("should compute FCFE as Net Income + D&A − CapEx (no D&A double-counting)", () => {
    const result = calculateDCF(baseInputs, 5);
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<{
        net_income: number;
        depreciation_amortization: number;
        capital_expenditure: number;
        fcfe: number;
      }>;

    projections.forEach((p) => {
      const expectedFCFE = p.net_income + p.depreciation_amortization - p.capital_expenditure;
      expect(p.fcfe).toBeCloseTo(expectedFCFE, 0);
      // FCFE must be greater than Net Income − CapEx (the old buggy formula)
      // because D&A add-back makes it higher
      expect(p.fcfe).toBeGreaterThanOrEqual(p.net_income - p.capital_expenditure);
    });
  });

  it("should handle high cost of equity with Gordon Growth fallback", () => {
    // When Ke <= terminal growth, should use fallback (lastFCFE * 20)
    const result = calculateDCF(
      { ...baseInputs, costOfEquity: 0.02, terminalGrowthRate: 0.025 },
      5
    );
    // Should not crash, should return a valid result
    expect(result.fair_value).toBeGreaterThan(0);
  });
});
