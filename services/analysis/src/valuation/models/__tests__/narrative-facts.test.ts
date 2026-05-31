import { describe, expect, it } from "vitest";
import { computeFullValuation } from "../summary.js";
import { buildNarrativeFacts } from "../narrative-facts.js";
import {
  appleCompany,
  appleFinancials,
  dividendCompany,
  dividendEstimates,
  dividendFinancials,
  preProfitCompany,
  preProfitEstimates,
  preProfitFinancials,
  preProfitPeers,
  testEstimates,
  testPeers,
} from "./fixtures.js";

describe("buildNarrativeFacts", () => {
  it("builds full-tier facts from the complete model set", () => {
    const summary = computeFullValuation({
      company: appleCompany,
      historicals: appleFinancials,
      estimates: testEstimates,
      peers: testPeers,
      currentPrice: 200,
      riskFreeRate: 0.04,
    });

    const facts = buildNarrativeFacts(summary);

    expect(facts.valuation_tier).toBe("full");
    expect(facts.primary_model?.model_type).toBe("dcf_fcff_growth_5y");
    expect(facts.model_count).toBeGreaterThanOrEqual(4);
    expect(facts.applicable_models.length).toBe(facts.model_count);
    expect(facts.pillar_signals.some((signal) => signal.pillar === "dcf")).toBe(true);
    expect(facts.key_drivers.length).toBeGreaterThan(0);
  });

  it("detects pre-profit summaries and uses revenue DCF as the basis", () => {
    const summary = computeFullValuation({
      company: preProfitCompany,
      historicals: preProfitFinancials,
      estimates: preProfitEstimates,
      peers: preProfitPeers,
      currentPrice: 68,
      riskFreeRate: 0.04,
      targetOperatingMargin: 0.18,
    });

    const facts = buildNarrativeFacts(summary);

    expect(facts.valuation_tier).toBe("pre_profit");
    expect(facts.primary_model?.model_type).toBe("revenue_dcf_10y");
    expect(facts.verdict_basis).toBe("Revenue DCF 10Y");
    expect(facts.key_tensions.join(" ")).toContain("scaling revenue into durable margins");
    expect(facts.risk_flags).toContain("profitability is still forecast-dependent");
  });

  it("captures dividend support as a downside framing flag", () => {
    const summary = computeFullValuation({
      company: dividendCompany,
      historicals: dividendFinancials,
      estimates: dividendEstimates,
      peers: testPeers,
      currentPrice: 160,
      riskFreeRate: 0.04,
    });

    const facts = buildNarrativeFacts(summary);

    expect(facts.applicable_models.some((model) => model.model_type === "ddm")).toBe(true);
    expect(facts.risk_flags).toContain("income support matters for downside framing");
    expect(facts.pillar_signals.some((signal) => signal.pillar === "ddm")).toBe(true);
  });
});
