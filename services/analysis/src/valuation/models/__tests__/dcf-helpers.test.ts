import { describe, it, expect } from "vitest";
import { cagr, avg, clamp, projectRevenue } from "../dcf-helpers.js";
import type { FinancialStatement, AnalystEstimate } from "../../types.js";

describe("cagr", () => {
  it("calculates basic CAGR correctly", () => {
    // $100 → $200 over 5 years = 14.87%
    const result = cagr(100, 200, 5);
    expect(result).toBeCloseTo(0.1487, 3);
  });

  it("returns 0 for zero/negative start value", () => {
    expect(cagr(0, 200, 5)).toBe(0);
    expect(cagr(-100, 200, 5)).toBe(0);
  });

  it("returns 0 for zero/negative end value", () => {
    expect(cagr(100, 0, 5)).toBe(0);
    expect(cagr(100, -50, 5)).toBe(0);
  });

  it("returns 0 for zero/negative years", () => {
    expect(cagr(100, 200, 0)).toBe(0);
    expect(cagr(100, 200, -1)).toBe(0);
  });

  it("handles 1-year period", () => {
    // $100 → $110 over 1 year = 10%
    expect(cagr(100, 110, 1)).toBeCloseTo(0.10, 4);
  });

  it("returns negative CAGR for shrinking values", () => {
    // $200 → $100 over 5 years = negative growth
    const result = cagr(200, 100, 5);
    expect(result).toBeLessThan(0);
  });
});

describe("avg", () => {
  it("calculates average correctly", () => {
    expect(avg([10, 20, 30])).toBe(20);
  });

  it("returns 0 for empty array", () => {
    expect(avg([])).toBe(0);
  });

  it("handles single element", () => {
    expect(avg([42])).toBe(42);
  });

  it("handles negative numbers", () => {
    expect(avg([-10, 10])).toBe(0);
  });
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min when below", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max when above", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it("handles value equal to boundary", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("projectRevenue", () => {
  // Minimal historicals: 3 years of revenue
  const historicals: FinancialStatement[] = [
    { fiscal_year: 2022, revenue: 1_000_000, net_income: 100_000 } as FinancialStatement,
    { fiscal_year: 2023, revenue: 1_100_000, net_income: 110_000 } as FinancialStatement,
    { fiscal_year: 2024, revenue: 1_210_000, net_income: 121_000 } as FinancialStatement,
  ];

  it("projects correct number of years", () => {
    const result = projectRevenue(historicals, [], 5);
    expect(result.years).toHaveLength(5);
    expect(result.revenues).toHaveLength(5);
    expect(result.growthRates).toHaveLength(5);
  });

  it("starts projection from the year after last historical", () => {
    const result = projectRevenue(historicals, [], 3);
    expect(result.years[0]).toBe(2025);
    expect(result.years[2]).toBe(2027);
  });

  it("uses analyst estimates when available", () => {
    const estimates: AnalystEstimate[] = [
      { period: "2025", revenue_estimate: 1_400_000 } as AnalystEstimate,
    ];
    const result = projectRevenue(historicals, estimates, 3);
    expect(result.revenues[0]).toBe(1_400_000);
    expect(result.source).toBe("analyst");
  });

  it("falls back to trend when no estimates", () => {
    const result = projectRevenue(historicals, [], 3);
    expect(result.source).toBe("trend");
    // Revenue should grow from last historical
    expect(result.revenues[0]).toBeGreaterThan(1_210_000);
  });

  it("throws on empty historicals", () => {
    expect(() => projectRevenue([], [], 5)).toThrow("No historical revenue data");
  });

  it("filters out zero-revenue entries", () => {
    const withZero = [
      { fiscal_year: 2023, revenue: 0 } as FinancialStatement,
      ...historicals,
    ];
    const result = projectRevenue(withZero, [], 3);
    // Should still work, ignoring the zero-revenue entry
    expect(result.revenues[0]).toBeGreaterThan(0);
  });

  it("fades growth towards GDP-like 3%", () => {
    // With 10-year projection and no estimates, late years should approach 3%
    const result = projectRevenue(historicals, [], 10);
    const lastGrowth = result.growthRates[result.growthRates.length - 1];
    // Last year growth should be close to 3% (faded)
    expect(lastGrowth).toBeCloseTo(0.03, 1);
  });
});
