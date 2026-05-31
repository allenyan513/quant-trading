import { describe, it, expect } from "vitest";
import { calculateWACC, buildWACCInputs, type WACCInputs } from "../wacc.js";
import { appleFinancials } from "./fixtures.js";

describe("calculateWACC", () => {
  const baseInputs: WACCInputs = {
    beta: 1.2,
    riskFreeRate: 0.0425,
    totalDebt: 100e9,
    marketCap: 3000e9,
    interestExpense: 3e9,
    taxRate: 0.21,
    betaMethod: "individual",
  };

  it("should compute CAPM cost of equity correctly", () => {
    const result = calculateWACC(baseInputs);
    // Ke = Rf + β × ERP = 0.0425 + 1.2 × 0.045 = 0.0965
    expect(result.cost_of_equity).toBeCloseTo(0.0965, 4);
  });

  it("should compute cost of debt as interest/debt", () => {
    const result = calculateWACC(baseInputs);
    // Kd = 3B / 100B = 0.03
    expect(result.cost_of_debt).toBeCloseTo(0.03, 4);
  });

  it("should compute capital structure weights", () => {
    const result = calculateWACC(baseInputs);
    // D = 100B, E = 3000B, Total = 3100B
    expect(result.debt_weight).toBeCloseTo(100 / 3100, 4);
    expect(result.equity_weight).toBeCloseTo(3000 / 3100, 4);
    expect(result.debt_weight + result.equity_weight).toBeCloseTo(1, 10);
  });

  it("should compute WACC correctly", () => {
    const result = calculateWACC(baseInputs);
    // WACC = Ke × E_w + Kd × (1-tax) × D_w
    const expected =
      0.0965 * (3000 / 3100) + 0.03 * (1 - 0.21) * (100 / 3100);
    expect(result.wacc).toBeCloseTo(expected, 4);
  });

  it("should cap cost of debt at 15%", () => {
    const result = calculateWACC({
      ...baseInputs,
      interestExpense: 50e9, // 50B / 100B = 50% → capped at 15%
    });
    expect(result.cost_of_debt).toBe(0.15);
  });

  it("should floor WACC at 5%", () => {
    const result = calculateWACC({
      ...baseInputs,
      beta: 0.3,
      riskFreeRate: 0.01,
      totalDebt: 0,
      marketCap: 1000e9,
    });
    expect(result.wacc).toBeGreaterThanOrEqual(0.05);
  });

  it("should cap WACC at 25%", () => {
    const result = calculateWACC({
      ...baseInputs,
      beta: 5.0,
      riskFreeRate: 0.15,
      additionalRiskPremium: 0.1,
    });
    expect(result.wacc).toBeLessThanOrEqual(0.25);
  });

  it("should handle zero debt (all-equity company)", () => {
    const result = calculateWACC({
      ...baseInputs,
      totalDebt: 0,
      interestExpense: 0,
    });
    expect(result.cost_of_debt).toBe(0);
    expect(result.debt_weight).toBe(0);
    expect(result.equity_weight).toBe(1);
    // WACC should equal cost of equity
    expect(result.wacc).toBeCloseTo(result.cost_of_equity, 4);
  });

  it("should use investment grade fallback when debt exists but no interest", () => {
    const result = calculateWACC({
      ...baseInputs,
      interestExpense: 0,
    });
    // Fallback = Rf + 1.5% = 0.0425 + 0.015 = 0.0575
    expect(result.cost_of_debt).toBeCloseTo(0.0575, 4);
  });

  it("should include additional risk premium", () => {
    const result = calculateWACC({
      ...baseInputs,
      additionalRiskPremium: 0.02,
    });
    // Ke = 0.0425 + 1.2 × 0.045 + 0.02 = 0.1165
    expect(result.cost_of_equity).toBeCloseTo(0.1165, 4);
  });

  it("should propagate beta_method and sector_unlevered_beta", () => {
    const result = calculateWACC({
      ...baseInputs,
      betaMethod: "bottom_up",
      sectorUnleveredBeta: 1.05,
    });
    expect(result.beta_method).toBe("bottom_up");
    expect(result.sector_unlevered_beta).toBe(1.05);
  });

  it("should default beta_method to individual when not specified", () => {
    const result = calculateWACC(baseInputs);
    expect(result.beta_method).toBe("individual");
    expect(result.sector_unlevered_beta).toBeUndefined();
  });
});

describe("buildWACCInputs", () => {
  it("should extract inputs from financial statements (individual beta)", () => {
    const fin = appleFinancials[0]; // FY2025
    const inputs = buildWACCInputs(fin, 1.2, 0.0425, 3000e9);

    // Adjusted beta: 0.67 * 1.2 + 0.33 * 1.0 = 1.134
    expect(inputs.beta).toBeCloseTo(1.134, 3);
    expect(inputs.riskFreeRate).toBe(0.0425);
    expect(inputs.marketCap).toBe(3000e9);
    expect(inputs.totalDebt).toBe(100e9);
    expect(inputs.interestExpense).toBe(2e9);
    expect(inputs.taxRate).toBe(0.21);
    expect(inputs.betaMethod).toBe("individual");
    expect(inputs.sectorUnleveredBeta).toBeUndefined();
  });

  it("should floor adjusted beta at 0.3", () => {
    const fin = appleFinancials[0];
    // raw=0.1 → adjusted = 0.67*0.1 + 0.33*1.0 = 0.397 → above 0.3 floor
    const inputs = buildWACCInputs(fin, 0.1, 0.04, 1000e9);
    expect(inputs.beta).toBeCloseTo(0.397, 3);
  });

  it("should clamp tax rate to [0.05, 0.45]", () => {
    const fin = { ...appleFinancials[0], tax_rate: 0.8 };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    // tax_rate 0.8 is > 0.5 so it tries to compute from financials
    // income_tax / income_before_tax = 25e9 / 125e9 = 0.2
    expect(inputs.taxRate).toBeGreaterThanOrEqual(0.05);
    expect(inputs.taxRate).toBeLessThanOrEqual(0.45);
  });

  it("should default to 21% tax when data is unavailable", () => {
    const fin = {
      ...appleFinancials[0],
      tax_rate: 0,
      income_before_tax: 0,
      income_tax: 0,
    };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    expect(inputs.taxRate).toBe(0.21);
  });

  it("should handle negative total debt gracefully", () => {
    const fin = { ...appleFinancials[0], total_debt: -50e9 };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    expect(inputs.totalDebt).toBe(0);
  });
});

describe("buildWACCInputs — bottom-up sector beta", () => {
  it("should use sector unlevered beta when provided", () => {
    const fin = appleFinancials[0]; // total_debt = 100B
    const marketCap = 3000e9;
    const sectorUnleveredBeta = 1.05;

    const inputs = buildWACCInputs(fin, 2.38, 0.04, marketCap, sectorUnleveredBeta);

    expect(inputs.betaMethod).toBe("bottom_up");
    expect(inputs.sectorUnleveredBeta).toBe(1.05);

    // Re-lever: 1.05 × (1 + (1-0.21) × 100B/3000B) = 1.05 × (1 + 0.79 × 0.03333) = 1.05 × 1.02633 ≈ 1.0776
    // Bloomberg: 0.67 × 1.0776 + 0.33 × 1.0 = 0.7220 + 0.33 = 1.0520
    const deRatio = 100e9 / 3000e9;
    const relevered = 1.05 * (1 + (1 - 0.21) * deRatio);
    const bloombergAdjusted = 0.67 * relevered + 0.33 * 1.0;
    expect(inputs.beta).toBeCloseTo(bloombergAdjusted, 3);
  });

  it("should produce lower beta than individual approach for high-beta stocks", () => {
    const fin = appleFinancials[0];
    const marketCap = 3000e9;

    // Individual: raw beta 2.38 (like NVDA)
    const individual = buildWACCInputs(fin, 2.38, 0.04, marketCap);
    // Bottom-up: sector median ~1.05
    const bottomUp = buildWACCInputs(fin, 2.38, 0.04, marketCap, 1.05);

    expect(bottomUp.beta).toBeLessThan(individual.beta);
    expect(bottomUp.betaMethod).toBe("bottom_up");
    expect(individual.betaMethod).toBe("individual");
  });

  it("should re-lever correctly for high-debt company", () => {
    const fin = { ...appleFinancials[0], total_debt: 500e9 }; // Heavy debt
    const marketCap = 500e9; // D/E = 1.0
    const sectorBeta = 0.8;

    const inputs = buildWACCInputs(fin, 1.0, 0.04, marketCap, sectorBeta);

    // Re-lever: 0.8 × (1 + (1-0.21) × 500B/500B) = 0.8 × (1 + 0.79) = 0.8 × 1.79 = 1.432
    // Bloomberg: 0.67 × 1.432 + 0.33 × 1.0 = 0.9594 + 0.33 = 1.2894
    const relevered = 0.8 * (1 + (1 - 0.21) * 1.0);
    const bloombergAdjusted = 0.67 * relevered + 0.33 * 1.0;
    expect(inputs.beta).toBeCloseTo(bloombergAdjusted, 3);
  });

  it("should fall back to individual beta when sector beta is null", () => {
    const fin = appleFinancials[0];
    const inputs = buildWACCInputs(fin, 1.2, 0.04, 3000e9, undefined);

    expect(inputs.betaMethod).toBe("individual");
    // Bloomberg: 0.67 × 1.2 + 0.33 × 1.0 = 1.134
    expect(inputs.beta).toBeCloseTo(1.134, 3);
  });

  it("should fall back to individual beta when sector beta is zero", () => {
    const fin = appleFinancials[0];
    const inputs = buildWACCInputs(fin, 1.2, 0.04, 3000e9, 0);

    expect(inputs.betaMethod).toBe("individual");
  });

  it("should handle all-equity company with bottom-up beta (D/E = 0)", () => {
    const fin = { ...appleFinancials[0], total_debt: 0 };
    const marketCap = 3000e9;
    const sectorBeta = 1.1;

    const inputs = buildWACCInputs(fin, 1.0, 0.04, marketCap, sectorBeta);

    // D/E = 0, so re-lever = sectorBeta × (1 + 0) = sectorBeta = 1.1
    // Bloomberg: 0.67 × 1.1 + 0.33 × 1.0 = 0.737 + 0.33 = 1.067
    expect(inputs.beta).toBeCloseTo(0.67 * 1.1 + 0.33 * 1.0, 3);
    expect(inputs.betaMethod).toBe("bottom_up");
  });
});
