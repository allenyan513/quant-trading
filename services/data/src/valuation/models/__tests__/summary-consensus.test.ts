import { describe, it, expect } from "vitest";
import { computeFullValuation } from "../summary.js";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  testPeers,
  generateHistoricalMultiples,
} from "./fixtures.js";

const BASE_INPUTS = {
  company: appleCompany,
  historicals: appleFinancials,
  estimates: testEstimates,
  peers: testPeers,
  currentPrice: 200,
  riskFreeRate: 0.04,
  historicalMultiples: generateHistoricalMultiples(500, 28, 20),
};

describe("computeFullValuation", () => {
  it("should use FCFF Growth Exit 5Y fair value as consensus", () => {
    const result = computeFullValuation(BASE_INPUTS);
    const fcffModel = result.models.find(m => m.model_type === "dcf_fcff_growth_5y");
    expect(fcffModel).toBeDefined();
    expect(result.consensus_fair_value).toBe(fcffModel!.fair_value);
  });

  it("should use FCFF Growth Exit 5Y range as consensus range", () => {
    const result = computeFullValuation(BASE_INPUTS);
    const fcffModel = result.models.find(m => m.model_type === "dcf_fcff_growth_5y");
    expect(result.consensus_low).toBe(fcffModel!.low_estimate);
    expect(result.consensus_high).toBe(fcffModel!.high_estimate);
  });

  it("should populate pillars for display", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.pillars.dcf.models.length).toBeGreaterThanOrEqual(1);
    expect(result.pillars.tradingMultiples.models.length).toBe(3); // P/E + EV/EBITDA + EV/Revenue
    expect(result.pillars.peg.models.length).toBe(1);
  });

  it("should run all models (4 DCF + 2 multiples + PEG + EPV — some may be N/A)", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.models.length).toBeGreaterThanOrEqual(4);
  });

  it("should set verdict based on consensus upside", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(["undervalued", "fairly_valued", "overvalued"]).toContain(result.verdict);
    expect(result.verdict_text).toBeTruthy();
  });

  it("should include classification", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.classification.archetype).toBeTruthy();
    expect(result.classification.label).toBeTruthy();
  });
});
