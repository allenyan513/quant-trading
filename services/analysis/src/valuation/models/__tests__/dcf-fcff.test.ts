import { describe, it, expect } from "vitest";
import { calculateDCFFCFF, type DCFFCFFInputs } from "../dcf-fcff.js";
import { appleFinancials, testEstimates } from "./fixtures.js";

function makeInputs(overrides: Partial<DCFFCFFInputs> = {}): DCFFCFFInputs {
  return {
    historicals: appleFinancials,
    estimates: testEstimates,
    wacc: 0.09,
    currentPrice: 200,
    sharesOutstanding: 15_000_000_000,
    cashAndEquivalents: 50e9,
    totalDebt: 100e9,
    terminalGrowthRate: 0.025,
    usefulLife: 5,
    ...overrides,
  };
}

describe("FCFF DCF Growth Exit 5Y", () => {
  it("should return model_type dcf_fcff_growth_5y", () => {
    const result = calculateDCFFCFF(makeInputs());
    expect(result.model_type).toBe("dcf_fcff_growth_5y");
  });

  it("should compute a positive fair value", () => {
    const result = calculateDCFFCFF(makeInputs());
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should project exactly 5 years", () => {
    const result = calculateDCFFCFF(makeInputs());
    const projections = result.details.projections as Array<{ year: number }>;
    expect(projections).toHaveLength(5);
  });

  it("should include a terminal year (Year 6)", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const terminalYear = details.terminal_year as { year: number; fcff: number };
    const projections = details.projections as Array<{ year: number }>;
    expect(terminalYear).toBeDefined();
    expect(terminalYear.year).toBe(projections[4].year + 1);
    expect(terminalYear.fcff).toBeGreaterThan(0);
  });

  it("should compute FCFF = EBITDA - Tax - CapEx - ΔWC", () => {
    const result = calculateDCFFCFF(makeInputs());
    const projections = result.details.projections as Array<{
      ebitda: number; tax: number; capex: number; delta_nwc: number; fcff: number;
    }>;

    for (const p of projections) {
      const expectedFCFF = p.ebitda - p.tax - p.capex - p.delta_nwc;
      expect(p.fcff).toBeCloseTo(expectedFCFF, 0);
    }
  });

  it("should use mid-year convention for discounting", () => {
    const result = calculateDCFFCFF(makeInputs());
    const projections = result.details.projections as Array<{ timing: number }>;
    expect(projections.map((p) => p.timing)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
  });

  it("should discount terminal value at year 5 (not mid-year)", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const terminalYear = details.terminal_year as { timing: number };
    expect(terminalYear.timing).toBe(5);
  });

  it("should compute EV = PV(FCFF) + PV(TV)", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const pvFCFF = details.pv_fcff_total as number;
    const pvTV = details.pv_terminal_value as number;
    const ev = details.enterprise_value as number;
    expect(ev).toBeCloseTo(pvFCFF + pvTV, 0);
  });

  it("should compute Equity = EV - Net Debt", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const ev = details.enterprise_value as number;
    const netDebt = details.net_debt as number;
    const equity = details.equity_value as number;
    expect(equity).toBeCloseTo(ev - netDebt, 0);
  });

  it("should compute Fair Value = Equity / Shares Outstanding", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const equity = details.equity_value as number;
    const shares = details.shares_outstanding as number;
    expect(result.fair_value).toBeCloseTo(equity / shares, 2);
  });

  it("should include D&A vintage schedule", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const daSchedule = details.da_schedule as {
      useful_life: number;
      vintages: { capex_year: number; amounts: number[] }[];
      totals: number[];
    };
    expect(daSchedule.useful_life).toBe(5);
    expect(daSchedule.totals).toHaveLength(5);
    expect(daSchedule.vintages.length).toBeGreaterThan(0);

    // Total D&A should equal sum of vintage amounts per year
    for (let i = 0; i < 5; i++) {
      const vintageSum = daSchedule.vintages.reduce((sum, v) => sum + v.amounts[i], 0);
      expect(daSchedule.totals[i]).toBeCloseTo(vintageSum, 0);
    }
  });

  it("should include working capital details", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const wc = details.working_capital as {
      dso: number; dpo: number; dio: number;
      years: number[]; nwc: number[]; delta_nwc: number[];
    };
    expect(wc.dso).toBeGreaterThan(0);
    expect(wc.dpo).toBeGreaterThan(0);
    expect(wc.years).toHaveLength(5);
    expect(wc.nwc).toHaveLength(5);
    expect(wc.delta_nwc).toHaveLength(5);
  });

  it("should include expense ratios in details", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const ratios = details.expense_ratios as {
      cogs_pct: number; sga_pct: number; rnd_pct: number;
      interest_pct: number; tax_rate: number;
    };
    expect(ratios.cogs_pct).toBeGreaterThan(0);
    expect(ratios.cogs_pct).toBeLessThan(1);
    expect(ratios.tax_rate).toBeGreaterThan(0);
    expect(ratios.tax_rate).toBeLessThan(0.5);
  });

  it("should include a 5x5 sensitivity matrix", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const sm = details.sensitivity_matrix as {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };
    expect(sm.discount_rate_values).toHaveLength(5);
    expect(sm.growth_values).toHaveLength(5);
    expect(sm.prices).toHaveLength(5);
    expect(sm.prices[0]).toHaveLength(5);
  });

  it("should compute upside_percent correctly", () => {
    const result = calculateDCFFCFF(makeInputs({ currentPrice: 100 }));
    const expected = ((result.fair_value - 100) / 100) * 100;
    expect(result.upside_percent).toBeCloseTo(expected, 2);
  });

  it("should handle WACC <= g gracefully", () => {
    const result = calculateDCFFCFF(makeInputs({ wacc: 0.02, terminalGrowthRate: 0.03 }));
    expect(result.fair_value).toBeGreaterThan(0);
    expect(isFinite(result.fair_value)).toBe(true);
  });

  it("should include base year data for display", () => {
    const result = calculateDCFFCFF(makeInputs());
    const details = result.details as Record<string, unknown>;
    const baseYear = details.base_year as { year: number; revenue: number };
    expect(baseYear.year).toBe(2025);
    expect(baseYear.revenue).toBe(400e9);
  });

  it("should set low and high estimates from sensitivity matrix", () => {
    const result = calculateDCFFCFF(makeInputs());
    expect(result.low_estimate).toBeGreaterThan(0);
    expect(result.high_estimate).toBeGreaterThan(result.low_estimate);
  });

  it("should include assumptions with WACC and expense breakdowns", () => {
    const result = calculateDCFFCFF(makeInputs());
    const a = result.assumptions as Record<string, unknown>;
    expect(a.wacc).toBeDefined();
    expect(a.terminal_growth_rate).toBeDefined();
    expect(a.cogs_pct_revenue).toBeDefined();
    expect(a.sga_pct_revenue).toBeDefined();
    expect(a.rnd_pct_revenue).toBeDefined();
    expect(a.dso).toBeDefined();
    expect(a.dpo).toBeDefined();
    expect(a.dio).toBeDefined();
    expect(a.useful_life).toBe(5);
    expect(a.projection_years).toBe(5);
  });

  it("should produce revenue from analyst estimates", () => {
    const result = calculateDCFFCFF(makeInputs());
    const projections = result.details.projections as Array<{ year: number; revenue: number }>;
    // First year should match analyst estimate (420B)
    expect(projections[0].revenue).toBeCloseTo(420e9, -8);
  });

  it("should throw with empty historicals", () => {
    expect(() => calculateDCFFCFF(makeInputs({ historicals: [] }))).toThrow();
  });
});
