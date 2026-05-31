import { describe, it, expect } from "vitest";
import { classifyCompany } from "../company-classifier.js";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  unprofitableCompany,
  unprofitableFinancials,
} from "./fixtures.js";

describe("classifyCompany", () => {
  it("should return a valid classification for a profitable growth company", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.archetype).toBeTruthy();
    expect(result.label).toBeTruthy();
    expect(result.description).toBeTruthy();
    expect(result.traits.length).toBeGreaterThan(0);
  });

  it("should assign model applicability", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.model_applicability.length).toBeGreaterThan(0);
    result.model_applicability.forEach((ma) => {
      expect(ma.model_type).toBeTruthy();
      expect(typeof ma.applicable).toBe("boolean");
      expect(["high", "medium", "low"]).toContain(ma.confidence);
      expect(["primary", "cross_check", "sanity_check", "not_applicable"]).toContain(ma.role);
    });
  });

  it("should handle unprofitable company", () => {
    const result = classifyCompany(
      unprofitableCompany,
      unprofitableFinancials,
      []
    );

    expect(result.archetype).toBeTruthy();
    expect(["loss_making", "turnaround", "high_growth"]).toContain(
      result.archetype
    );
  });

  it("should handle single year of data", () => {
    const result = classifyCompany(
      appleCompany,
      [appleFinancials[0]],
      testEstimates
    );

    expect(result.archetype).toBeTruthy();
  });
});
