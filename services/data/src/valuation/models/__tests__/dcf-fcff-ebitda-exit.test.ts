import { describe, it, expect } from "vitest";
import { calculateDCFFCFFEBITDAExit, type DCFFCFFEBITDAExitInputs } from "../dcf-fcff.js";
import { appleFinancials, testEstimates } from "./fixtures.js";

function makeInputs(overrides: Partial<DCFFCFFEBITDAExitInputs> = {}): DCFFCFFEBITDAExitInputs {
  return {
    historicals: appleFinancials,
    estimates: testEstimates,
    wacc: 0.09,
    currentPrice: 200,
    sharesOutstanding: 15_000_000_000,
    cashAndEquivalents: 50e9,
    totalDebt: 100e9,
    peerEVEBITDAMedian: 15,
    usefulLife: 5,
    ...overrides,
  };
}

describe("FCFF EBITDA Exit 5Y", () => {
  it("should return model_type dcf_fcff_ebitda_exit_5y", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    expect(result.model_type).toBe("dcf_fcff_ebitda_exit_5y");
  });

  it("should compute a positive fair value", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should project exactly 5 years", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    const projections = result.details.projections as Array<{ year: number }>;
    expect(projections).toHaveLength(5);
  });

  it("should use EBITDA × multiple for terminal value", () => {
    const multiple = 12;
    const result = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: multiple }));
    const details = result.details as Record<string, unknown>;
    const terminalYear = details.terminal_year as { ebitda: number };
    const terminalValue = details.terminal_value as number;
    expect(terminalValue).toBeCloseTo(terminalYear.ebitda * multiple, 0);
  });

  it("terminal value should scale linearly with the multiple", () => {
    const result8 = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: 8 }));
    const result16 = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: 16 }));
    const tv8 = result8.details.terminal_value as number;
    const tv16 = result16.details.terminal_value as number;
    expect(tv16).toBeCloseTo(tv8 * 2, 0);
  });

  it("should discount terminal value at year 5 (end-of-year)", () => {
    const wacc = 0.09;
    const result = calculateDCFFCFFEBITDAExit(makeInputs({ wacc }));
    const details = result.details as Record<string, unknown>;
    const tv = details.terminal_value as number;
    const pvTV = details.pv_terminal_value as number;
    expect(pvTV).toBeCloseTo(tv / Math.pow(1 + wacc, 5), 0);
  });

  it("should use mid-year convention for FCF discounting", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    const projections = result.details.projections as Array<{ timing: number }>;
    const expectedTimings = [0.5, 1.5, 2.5, 3.5, 4.5];
    projections.forEach((p, i) => {
      expect(p.timing).toBeCloseTo(expectedTimings[i], 5);
    });
  });

  it("should compute equity value correctly: EV - Net Debt", () => {
    const inputs = makeInputs();
    const result = calculateDCFFCFFEBITDAExit(inputs);
    const details = result.details as Record<string, unknown>;
    const ev = details.enterprise_value as number;
    const netDebt = details.net_debt as number;
    const equity = details.equity_value as number;
    expect(equity).toBeCloseTo(ev - netDebt, 0);
  });

  it("should store assumptions with terminal_method = ebitda_exit", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    expect(result.assumptions.terminal_method).toBe("ebitda_exit");
  });

  it("should store the peer multiple in assumptions", () => {
    const multiple = 14.5;
    const result = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: multiple }));
    expect(result.assumptions.peer_ev_ebitda_multiple).toBeCloseTo(multiple, 1);
  });

  it("higher multiple should produce higher fair value", () => {
    const low = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: 8 }));
    const high = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: 20 }));
    expect(high.fair_value).toBeGreaterThan(low.fair_value);
  });

  it("higher WACC should produce lower fair value", () => {
    const low = calculateDCFFCFFEBITDAExit(makeInputs({ wacc: 0.07 }));
    const high = calculateDCFFCFFEBITDAExit(makeInputs({ wacc: 0.12 }));
    expect(low.fair_value).toBeGreaterThan(high.fair_value);
  });

  it("sensitivity matrix should be 5×5 (WACC × Multiple)", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    const sm = result.details.sensitivity_matrix as Record<string, unknown>;
    expect((sm.discount_rate_values as number[]).length).toBe(5);
    expect((sm.multiple_values as number[]).length).toBe(5);
    expect((sm.prices as number[][]).length).toBe(5);
    expect((sm.prices as number[][])[0].length).toBe(5);
  });

  it("low_estimate and high_estimate should bracket fair_value", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
  });

  // --- Edge cases ---

  it("should clamp fair value to 0 when equity is negative (very low multiple)", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs({ peerEVEBITDAMedian: 0.5 }));
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
  });

  it("should handle net cash position (cash > debt)", () => {
    const result = calculateDCFFCFFEBITDAExit(
      makeInputs({ cashAndEquivalents: 200e9, totalDebt: 50e9 })
    );
    const netDebt = result.details.net_debt as number;
    expect(netDebt).toBeLessThan(0); // net cash
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should produce finite values with very high WACC", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs({ wacc: 0.25 }));
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.fair_value)).toBe(true);
  });

  it("all sensitivity prices should be non-negative", () => {
    const result = calculateDCFFCFFEBITDAExit(makeInputs());
    const sm = result.details.sensitivity_matrix as { prices: number[][] };
    for (const row of sm.prices) {
      for (const price of row) {
        expect(price).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
