import { describe, expect, it } from "vitest";
import { computeFullValuation } from "../summary.js";
import { buildFallbackValuationNarrative } from "../generate-narrative.js";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  testPeers,
} from "./fixtures.js";

describe("buildFallbackValuationNarrative", () => {
  it("builds a deterministic narrative block from summary facts", () => {
    const summary = computeFullValuation({
      company: appleCompany,
      historicals: appleFinancials,
      estimates: testEstimates,
      peers: testPeers,
      currentPrice: 200,
      riskFreeRate: 0.04,
    });

    const narrative = buildFallbackValuationNarrative(summary);

    expect(narrative.status).toBe("fallback");
    expect(narrative.headline).toContain("TEST");
    expect(narrative.quick_take).toContain("Test Corp");
    expect(narrative.full_narrative.length).toBeGreaterThan(120);
    expect(narrative.key_drivers.length).toBeGreaterThan(0);
  });
});
