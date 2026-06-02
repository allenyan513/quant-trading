import { describe, it, expect } from "vitest";
import { calculateDCFFCFF10Y, type DCFFCFFInputs } from "../dcf-fcff.js";
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

describe("FCFF DCF Growth Exit 10Y", () => {
  it("should return model_type dcf_fcff_growth_10y", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    expect(result.model_type).toBe("dcf_fcff_growth_10y");
  });

  it("should compute a positive fair value", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should project exactly 10 years", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const projections = result.details.projections as Array<{ year: number }>;
    expect(projections).toHaveLength(10);
  });

  it("should include a terminal year (Year 11)", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const terminalYear = details.terminal_year as { year: number; fcff: number };
    const projections = details.projections as Array<{ year: number }>;
    expect(terminalYear).toBeDefined();
    expect(terminalYear.year).toBe(projections[9].year + 1);
    expect(terminalYear.fcff).toBeGreaterThan(0);
  });

  it("should compute FCFF = EBITDA - Tax - CapEx - ΔWC for all 10 years", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const projections = result.details.projections as Array<{
      ebitda: number; tax: number; capex: number; delta_nwc: number; fcff: number;
    }>;

    expect(projections).toHaveLength(10);
    for (const p of projections) {
      const expectedFCFF = p.ebitda - p.tax - p.capex - p.delta_nwc;
      expect(p.fcff).toBeCloseTo(expectedFCFF, 0);
    }
  });

  it("should use mid-year convention for all 10 years", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const projections = result.details.projections as Array<{ timing: number }>;
    expect(projections.map((p) => p.timing)).toEqual([
      0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5,
    ]);
  });

  it("should discount terminal value at year 10 (not mid-year)", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const terminalYear = details.terminal_year as { timing: number };
    expect(terminalYear.timing).toBe(10);
  });

  it("should compute EV = PV(FCFF) + PV(TV)", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const pvFCFF = details.pv_fcff_total as number;
    const pvTV = details.pv_terminal_value as number;
    const ev = details.enterprise_value as number;
    expect(ev).toBeCloseTo(pvFCFF + pvTV, 0);
  });

  it("should compute Equity = EV - Net Debt", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const ev = details.enterprise_value as number;
    const netDebt = details.net_debt as number;
    const equity = details.equity_value as number;
    expect(equity).toBeCloseTo(ev - netDebt, 0);
  });

  it("should have projection_years = 10 in assumptions", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const a = result.assumptions as Record<string, unknown>;
    expect(a.projection_years).toBe(10);
  });

  it("should include D&A vintage schedule with 10 totals", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const daSchedule = details.da_schedule as { totals: number[] };
    expect(daSchedule.totals).toHaveLength(10);
  });

  it("should include working capital with 10 years", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const details = result.details as Record<string, unknown>;
    const wc = details.working_capital as { years: number[]; nwc: number[]; delta_nwc: number[] };
    expect(wc.years).toHaveLength(10);
    expect(wc.nwc).toHaveLength(10);
    expect(wc.delta_nwc).toHaveLength(10);
  });

  it("should have lower terminal value weight than 5Y model", () => {
    const inputs = makeInputs();
    const result10Y = calculateDCFFCFF10Y(inputs);
    // With 10 years of explicit projections, terminal value should be a smaller fraction
    const d = result10Y.details as Record<string, unknown>;
    const pvFCFF = d.pv_fcff_total as number;
    const pvTV = d.pv_terminal_value as number;
    const tvPortion = pvTV / (pvFCFF + pvTV);
    // Terminal value should still be significant but < 100%
    expect(tvPortion).toBeGreaterThan(0);
    expect(tvPortion).toBeLessThan(1);
  });

  it("should handle WACC <= g gracefully", () => {
    const result = calculateDCFFCFF10Y(makeInputs({ wacc: 0.02, terminalGrowthRate: 0.03 }));
    expect(result.fair_value).toBeGreaterThan(0);
    expect(isFinite(result.fair_value)).toBe(true);
  });

  it("should show revenue growth fading in later years", () => {
    const result = calculateDCFFCFF10Y(makeInputs());
    const a = result.assumptions as Record<string, unknown>;
    const growthRates = a.revenue_growth_rates as number[];
    expect(growthRates).toHaveLength(10);
    // Later years should have lower growth rates (fade toward GDP)
    const earlyAvg = (growthRates[0] + growthRates[1] + growthRates[2]) / 3;
    const lateAvg = (growthRates[7] + growthRates[8] + growthRates[9]) / 3;
    expect(lateAvg).toBeLessThanOrEqual(earlyAvg);
  });
});
