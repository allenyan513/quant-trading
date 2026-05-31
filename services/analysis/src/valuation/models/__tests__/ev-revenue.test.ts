import { describe, it, expect } from "vitest";
import { calculateEVRevenueMultiples, calculateEVRevenueMultiplesDetailed } from "../trading-multiples.js";
import { preProfitCompany, preProfitFinancials, preProfitPeers, makeFinancial } from "./fixtures.js";
import type { TradingMultiplesInputs } from "../trading-multiples.js";

const baseInputs: TradingMultiplesInputs = {
  financials: preProfitFinancials[0], // 2025 data
  company: preProfitCompany,
  currentPrice: 68,
  peers: preProfitPeers,
  forwardRevenue: 871e6, // analyst estimate
};

describe("EV/Revenue Multiples", () => {
  it("produces a positive fair value with valid peers", () => {
    const result = calculateEVRevenueMultiples(baseInputs);
    expect(result.model_type).toBe("ev_revenue_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("builds trailing and forward legs", () => {
    const detailed = calculateEVRevenueMultiplesDetailed(baseInputs);
    expect(detailed.trailing).not.toBeNull();
    expect(detailed.trailing?.metricLabel).toBe("Revenue (TTM)");
    expect(detailed.forward).not.toBeNull();
    expect(detailed.forward?.metricLabel).toBe("Revenue (Forward)");
  });

  it("median is close to 2.0x for aerospace peers", () => {
    const detailed = calculateEVRevenueMultiplesDetailed(baseInputs);
    // Peers: 2.5, 1.8, 2.0 → median = 2.0
    expect(detailed.trailing?.industryMedian).toBeCloseTo(2.0, 1);
  });

  it("returns N/A when no revenue", () => {
    const noRevFin = makeFinancial(2025, { revenue: 0, net_income: -50e6 });
    const result = calculateEVRevenueMultiples({
      ...baseInputs,
      financials: noRevFin,
    });
    expect(result.fair_value).toBe(0);
    expect(result.assumptions).toHaveProperty("note");
  });

  it("returns N/A when no valid peers", () => {
    const result = calculateEVRevenueMultiples({
      ...baseInputs,
      peers: [], // no peers
    });
    expect(result.fair_value).toBe(0);
  });

  it("caps extreme peer EV/Revenue at 200", () => {
    const extremePeers = [
      { ...preProfitPeers[0], ev_revenue: 250, forward_ev_revenue: 300 }, // should be filtered
      { ...preProfitPeers[1], ev_revenue: 5, forward_ev_revenue: 4 },     // valid
    ];
    const detailed = calculateEVRevenueMultiplesDetailed({
      ...baseInputs,
      peers: extremePeers,
    });
    // Only 1 valid peer (the one with 5x)
    expect(detailed.peerCount).toBe(1);
  });

  it("uses forward leg when forwardRevenue provided", () => {
    const withForward = calculateEVRevenueMultiplesDetailed(baseInputs);
    const withoutForward = calculateEVRevenueMultiplesDetailed({
      ...baseInputs,
      forwardRevenue: undefined,
    });
    // Both should have trailing; only withForward should have forward leg
    expect(withForward.forward).not.toBeNull();
    expect(withoutForward.forward).toBeNull();
  });

  it("provides low/high estimates from p25/p75", () => {
    const result = calculateEVRevenueMultiples(baseInputs);
    if (result.fair_value > 0) {
      expect(result.low_estimate).toBeGreaterThan(0);
      expect(result.high_estimate).toBeGreaterThan(result.low_estimate);
    }
  });
});
