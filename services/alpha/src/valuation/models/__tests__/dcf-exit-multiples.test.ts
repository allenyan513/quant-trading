import { describe, it, expect } from "vitest";
import {
  calculateDCFFCFFEBITDAExit,
  calculateDCFFCFFEBITDAExit10Y,
  type DCFFCFFEBITDAExitInputs,
} from "../dcf-fcff.js";
import { appleFinancials, testEstimates } from "./fixtures.js";

const baseInputs: DCFFCFFEBITDAExitInputs = {
  historicals: appleFinancials,
  estimates: testEstimates,
  wacc: 0.10,
  currentPrice: 200,
  sharesOutstanding: 15_000_000_000,
  cashAndEquivalents: 50e9,
  totalDebt: 100e9,
  peerEVEBITDAMedian: 15,
};

describe("calculateDCFFCFFEBITDAExit (5Y)", () => {
  it("should return a valid result with positive fair value", () => {
    const result = calculateDCFFCFFEBITDAExit(baseInputs);

    expect(result.model_type).toBe("dcf_fcff_ebitda_exit_5y");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.computed_at).toBeTruthy();
  });

  it("should produce 5 projection years", () => {
    const result = calculateDCFFCFFEBITDAExit(baseInputs);
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<Record<string, unknown>>;

    expect(projections).toHaveLength(5);
  });

  it("should include EBITDA exit assumptions", () => {
    const result = calculateDCFFCFFEBITDAExit(baseInputs);
    expect(result.assumptions.terminal_method).toBe("ebitda_exit");
    expect(result.assumptions.peer_ev_ebitda_multiple).toBe(15);
  });

  it("should have higher fair value with higher exit multiple", () => {
    const lowMult = calculateDCFFCFFEBITDAExit({ ...baseInputs, peerEVEBITDAMedian: 10 });
    const highMult = calculateDCFFCFFEBITDAExit({ ...baseInputs, peerEVEBITDAMedian: 20 });

    expect(highMult.fair_value).toBeGreaterThan(lowMult.fair_value);
  });
});

describe("calculateDCFFCFFEBITDAExit10Y", () => {
  it("should return a valid result with positive fair value", () => {
    const result = calculateDCFFCFFEBITDAExit10Y(baseInputs);

    expect(result.model_type).toBe("dcf_fcff_ebitda_exit_10y");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.computed_at).toBeTruthy();
  });

  it("should produce 10 projection years", () => {
    const result = calculateDCFFCFFEBITDAExit10Y(baseInputs);
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<Record<string, unknown>>;

    expect(projections).toHaveLength(10);
  });

  it("should include EBITDA exit assumptions", () => {
    const result = calculateDCFFCFFEBITDAExit10Y(baseInputs);
    expect(result.assumptions.terminal_method).toBe("ebitda_exit");
    expect(result.assumptions.peer_ev_ebitda_multiple).toBe(15);
    expect(result.assumptions.projection_years).toBe(10);
  });

  it("should include sensitivity matrix (WACC × EV/EBITDA Multiple)", () => {
    const result = calculateDCFFCFFEBITDAExit10Y(baseInputs);
    const details = result.details as Record<string, unknown>;
    const matrix = details.sensitivity_matrix as {
      discount_rate_values: number[];
      multiple_values: number[];
      prices: number[][];
    };

    expect(matrix.discount_rate_values).toHaveLength(5);
    expect(matrix.multiple_values).toHaveLength(5);
    expect(matrix.prices).toHaveLength(5);
  });

  it("should have higher fair value with higher exit multiple", () => {
    const lowMult = calculateDCFFCFFEBITDAExit10Y({ ...baseInputs, peerEVEBITDAMedian: 10 });
    const highMult = calculateDCFFCFFEBITDAExit10Y({ ...baseInputs, peerEVEBITDAMedian: 20 });

    expect(highMult.fair_value).toBeGreaterThan(lowMult.fair_value);
  });

  it("should differ from 5Y result", () => {
    const result5Y = calculateDCFFCFFEBITDAExit(baseInputs);
    const result10Y = calculateDCFFCFFEBITDAExit10Y(baseInputs);

    // Both should produce valid results but with different fair values
    expect(result5Y.fair_value).toBeGreaterThan(0);
    expect(result10Y.fair_value).toBeGreaterThan(0);
    expect(result5Y.fair_value).not.toBe(result10Y.fair_value);
  });

  it("should clamp fair value at 0 with extreme debt", () => {
    const result = calculateDCFFCFFEBITDAExit10Y({
      ...baseInputs,
      peerEVEBITDAMedian: 5,
      totalDebt: 5000e9,
      cashAndEquivalents: 0,
    });
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
  });
});
