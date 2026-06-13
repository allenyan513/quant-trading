import { describe, it, expect } from "vitest";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  calculatePEMultiplesDetailed,
  calculateEVEBITDAMultiplesDetailed,
} from "../trading-multiples.js";
import {
  appleCompany,
  appleFinancials,
  testPeers,
  unprofitableCompany,
  unprofitableFinancials,
} from "./fixtures.js";

// ============================================================
// P/E Multiples (peer-based, trailing + forward)
// ============================================================

describe("calculatePEMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should use peer comparison method", () => {
    const result = calculatePEMultiples(baseInputs);
    expect(result.model_type).toBe("pe_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe("peer_comparison");
  });

  it("should compute trailing leg from peer median × net income ÷ shares", () => {
    const detailed = calculatePEMultiplesDetailed(baseInputs);
    expect(detailed.trailing).not.toBeNull();
    // Peer trailing PEs: 25, 30, 22 → median = 25
    expect(detailed.trailing!.industryMedian).toBe(25);
    expect(detailed.trailing!.companyMetric).toBe(appleFinancials[0].net_income);
    expect(detailed.trailing!.fairPrice).toBeGreaterThan(0);
  });

  it("should compute forward leg when forwardNetIncome provided", () => {
    const forwardNetIncome = 132e9; // forward net income
    const detailed = calculatePEMultiplesDetailed({ ...baseInputs, forwardNetIncome });
    expect(detailed.forward).not.toBeNull();
    // Peer forward PEs: 22, 27, 20 → median = 22
    expect(detailed.forward!.industryMedian).toBe(22);
    expect(detailed.forward!.companyMetric).toBe(forwardNetIncome);
  });

  it("should average trailing and forward legs for selected fair value", () => {
    const forwardNetIncome = 132e9;
    const detailed = calculatePEMultiplesDetailed({ ...baseInputs, forwardNetIncome });
    const avgPrice = (detailed.trailing!.fairPrice + detailed.forward!.fairPrice) / 2;
    expect(detailed.result.fair_value).toBeCloseTo(avgPrice, 1);
  });

  it("should use trailing only when no forward data", () => {
    const detailed = calculatePEMultiplesDetailed(baseInputs);
    expect(detailed.trailing).not.toBeNull();
    expect(detailed.forward).toBeNull();
    expect(detailed.result.fair_value).toBeCloseTo(detailed.trailing!.fairPrice, 1);
  });

  it("should return N/A for negative net income", () => {
    const result = calculatePEMultiples({
      ...baseInputs,
      financials: unprofitableFinancials[0],
      company: unprofitableCompany,
    });
    expect(result.fair_value).toBe(0);
    expect((result.assumptions as Record<string, unknown>).note).toContain("N/A");
  });

  it("should compute low/high from peer percentiles", () => {
    const result = calculatePEMultiples(baseInputs);
    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
    expect(result.high_estimate - result.low_estimate).toBeGreaterThan(0);
  });

  it("should include trailing and forward medians in assumptions", () => {
    const forwardNetIncome = 132e9;
    const result = calculatePEMultiples({ ...baseInputs, forwardNetIncome });
    const assumptions = result.assumptions as Record<string, unknown>;
    expect(assumptions.trailing_median).toBeDefined();
    expect(assumptions.forward_median).toBeDefined();
    expect(assumptions.legs_used).toBe(2);
  });

  it("should return N/A when no peers have valid P/E", () => {
    const noPePeers = testPeers.map((p) => ({ ...p, trailing_pe: null, forward_pe: null }));
    const result = calculatePEMultiples({ ...baseInputs, peers: noPePeers });
    expect(result.fair_value).toBe(0);
  });
});

// ============================================================
// EV/EBITDA Multiples (peer-based, trailing + forward)
// ============================================================

describe("calculateEVEBITDAMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should compute EV-based fair value using peer median", () => {
    const result = calculateEVEBITDAMultiples(baseInputs);
    expect(result.model_type).toBe("ev_ebitda_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe("peer_comparison");
    expect((result.assumptions as Record<string, unknown>).net_debt).toBeDefined();
  });

  it("should compute trailing leg with EV bridge", () => {
    const detailed = calculateEVEBITDAMultiplesDetailed(baseInputs);
    expect(detailed.trailing).not.toBeNull();
    // Peer EV/EBITDA: 20, 25, 18 → median = 20
    expect(detailed.trailing!.industryMedian).toBe(20);
    expect(detailed.trailing!.enterpriseValue).toBeGreaterThan(0);
    expect(detailed.trailing!.equityValue).toBeDefined();
  });

  it("should compute forward leg when forwardEBITDA provided", () => {
    const forwardEBITDA = 168e9;
    const detailed = calculateEVEBITDAMultiplesDetailed({ ...baseInputs, forwardEBITDA });
    expect(detailed.forward).not.toBeNull();
    // Peer forward EV/EBITDA: 17, 21, 15 → median = 17
    expect(detailed.forward!.industryMedian).toBe(17);
    expect(detailed.forward!.enterpriseValue).toBeGreaterThan(0);
  });

  it("should average trailing and forward legs", () => {
    const forwardEBITDA = 168e9;
    const detailed = calculateEVEBITDAMultiplesDetailed({ ...baseInputs, forwardEBITDA });
    const avgPrice = (detailed.trailing!.fairPrice + detailed.forward!.fairPrice) / 2;
    expect(detailed.result.fair_value).toBeCloseTo(avgPrice, 1);
  });

  it("should return N/A for zero EBITDA", () => {
    const noEbitda = { ...appleFinancials[0], ebitda: 0 };
    const result = calculateEVEBITDAMultiples({ ...baseInputs, financials: noEbitda });
    expect(result.fair_value).toBe(0);
  });

  it("should compute low/high from peer percentiles via EV bridge", () => {
    const result = calculateEVEBITDAMultiples(baseInputs);
    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
  });
});
