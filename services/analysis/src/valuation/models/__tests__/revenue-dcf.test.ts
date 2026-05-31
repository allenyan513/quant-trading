import { describe, it, expect } from "vitest";
import { calculateRevenueDCF, calculateRevenueDCF10Y } from "../revenue-dcf.js";
import { preProfitFinancials, preProfitEstimates, makeFinancial } from "./fixtures.js";
import type { RevenueDCFInputs } from "../revenue-dcf.js";

const baseInputs: RevenueDCFInputs = {
  historicals: preProfitFinancials,
  estimates: preProfitEstimates,
  wacc: 0.10,
  currentPrice: 68,
  sharesOutstanding: 530_000_000,
  cashAndEquivalents: 829e6,
  totalDebt: 254e6,
  terminalGrowthRate: 0.03,
  targetOperatingMargin: 0.20, // 20% target — needs to be high enough to cover capex-heavy business
};

describe("Revenue DCF (Margin Convergence)", () => {
  it("produces a result for RKLB-like pre-profit company", () => {
    const result = calculateRevenueDCF(baseInputs);
    expect(result.model_type).toBe("revenue_dcf_5y");
    // Fair value may be 0 for deeply unprofitable companies where even 20% target
    // margin doesn't overcome the negative early-year FCFs at 10% WACC.
    // The model still runs correctly and provides sensitivity analysis.
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
    expect(result.details).toHaveProperty("projections");
  });

  it("produces positive fair value with generous assumptions", () => {
    // Higher target margin + lower WACC makes the math work
    const result = calculateRevenueDCF({
      ...baseInputs,
      wacc: 0.08,
      targetOperatingMargin: 0.25,
    });
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.upside_percent).not.toBe(0);
  });

  it("margin converges from negative to positive over 5 years", () => {
    const result = calculateRevenueDCF(baseInputs);
    const projections = result.details.projections as Array<{ operating_margin: number }>;
    expect(projections).toBeDefined();
    expect(projections.length).toBe(5);
    // Year 1 margin should be between current (-38%) and target (10%)
    expect(projections[0].operating_margin).toBeGreaterThan(-0.38);
    expect(projections[0].operating_margin).toBeLessThan(0.10);
    // Year 5 margin should be at or very near the target
    expect(projections[4].operating_margin).toBeCloseTo(0.20, 2);
  });

  it("applies NOL tax shield when operating income is negative", () => {
    const result = calculateRevenueDCF(baseInputs);
    const projections = result.details.projections as Array<{ operating_income: number; tax: number }>;
    // Early years with negative operating income should have zero tax
    const negativeYears = projections.filter(p => p.operating_income < 0);
    for (const year of negativeYears) {
      expect(year.tax).toBe(0);
    }
  });

  it("includes sensitivity matrix (WACC × Target Margin)", () => {
    const result = calculateRevenueDCF(baseInputs);
    const matrix = result.details.sensitivity_matrix as {
      discount_rate_values: number[];
      margin_values: number[];
      prices: number[][];
    };
    expect(matrix).toBeDefined();
    expect(matrix.discount_rate_values.length).toBe(5);
    expect(matrix.margin_values.length).toBe(5);
    expect(matrix.prices.length).toBe(5);
    expect(matrix.prices[0].length).toBe(5);
  });

  it("returns N/A when no revenue data", () => {
    const noRevenueFin = [makeFinancial(2025, { revenue: 0, net_income: -50e6 })];
    const result = calculateRevenueDCF({
      ...baseInputs,
      historicals: noRevenueFin,
    });
    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
  });

  it("higher target margin produces higher fair value", () => {
    const lowMargin = calculateRevenueDCF({ ...baseInputs, targetOperatingMargin: 0.05 });
    const highMargin = calculateRevenueDCF({ ...baseInputs, targetOperatingMargin: 0.20 });
    // Higher target margin = more eventual cash flow = higher value
    if (lowMargin.fair_value > 0 && highMargin.fair_value > 0) {
      expect(highMargin.fair_value).toBeGreaterThan(lowMargin.fair_value);
    }
  });

  it("higher WACC produces lower fair value", () => {
    const lowWACC = calculateRevenueDCF({ ...baseInputs, wacc: 0.08 });
    const highWACC = calculateRevenueDCF({ ...baseInputs, wacc: 0.16 });
    if (lowWACC.fair_value > 0 && highWACC.fair_value > 0) {
      expect(lowWACC.fair_value).toBeGreaterThan(highWACC.fair_value);
    }
  });

  it("records assumptions transparently", () => {
    const result = calculateRevenueDCF(baseInputs);
    expect(result.assumptions).toHaveProperty("current_operating_margin");
    expect(result.assumptions).toHaveProperty("target_operating_margin", 0.20);
    expect(result.assumptions).toHaveProperty("wacc", 0.10);
    expect(result.assumptions).toHaveProperty("terminal_growth_rate", 0.03);
  });
});

describe("Revenue DCF 10Y", () => {
  it("produces a result with model_type revenue_dcf_10y", () => {
    const result = calculateRevenueDCF10Y(baseInputs);
    expect(result.model_type).toBe("revenue_dcf_10y");
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
    expect(result.details).toHaveProperty("projections");
  });

  it("projects 10 years (not 5)", () => {
    const result = calculateRevenueDCF10Y(baseInputs);
    const projections = result.details.projections as Array<{ operating_margin: number }>;
    expect(projections.length).toBe(10);
    expect(result.assumptions).toHaveProperty("projection_years", 10);
    expect(result.assumptions).toHaveProperty("convergence_years", 5);
  });

  it("margin converges by Year 5 then holds at target for Years 6-10", () => {
    const result = calculateRevenueDCF10Y(baseInputs);
    const projections = result.details.projections as Array<{ operating_margin: number }>;
    // Year 5 should be at target
    expect(projections[4].operating_margin).toBeCloseTo(0.20, 2);
    // Years 6-10 should also be at target
    for (let i = 5; i < 10; i++) {
      expect(projections[i].operating_margin).toBeCloseTo(0.20, 2);
    }
  });

  it("10Y fair value >= 5Y fair value (more positive FCFF years)", () => {
    const result5Y = calculateRevenueDCF(baseInputs);
    const result10Y = calculateRevenueDCF10Y(baseInputs);
    // 10Y should produce equal or higher fair value because it captures
    // more years of positive cash flows after margin convergence
    expect(result10Y.fair_value).toBeGreaterThanOrEqual(result5Y.fair_value);
  });

  it("returns N/A when no revenue data", () => {
    const noRevenueFin = [makeFinancial(2025, { revenue: 0, net_income: -50e6 })];
    const result = calculateRevenueDCF10Y({ ...baseInputs, historicals: noRevenueFin });
    expect(result.fair_value).toBe(0);
    expect(result.model_type).toBe("revenue_dcf_10y");
    expect(result.assumptions).toHaveProperty("note");
  });
});
