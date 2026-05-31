import { describe, it, expect } from "vitest";
import { MODEL_LINKS, MODEL_NAMES } from "../model-names.js";

describe("MODEL_LINKS", () => {
  it("should use anchor fragments (not sub-page routes)", () => {
    for (const [key, link] of Object.entries(MODEL_LINKS)) {
      expect(link).toMatch(/^\/valuation#/);
    }
  });

  it("should have links for all models in MODEL_NAMES", () => {
    const currentModelTypes = [
      "dcf_fcff_growth_5y",
      "dcf_fcff_growth_10y",
      "dcf_fcff_ebitda_exit_5y",
      "dcf_fcff_ebitda_exit_10y",
      "revenue_dcf_5y",
      "revenue_dcf_10y",
      "pe_multiples",
      "ev_ebitda_multiples",
      "ev_revenue_multiples",
      "peg",
      "epv",
      "ddm",
    ];
    for (const type of currentModelTypes) {
      expect(MODEL_LINKS[type]).toBeDefined();
      expect(MODEL_NAMES[type]).toBeDefined();
    }
  });

  it("should point DCF models to #dcf anchor", () => {
    const dcfKeys = [
      "dcf_fcff_growth_5y",
      "dcf_fcff_growth_10y",
      "dcf_fcff_ebitda_exit_5y",
      "dcf_fcff_ebitda_exit_10y",
      "revenue_dcf_5y",
      "revenue_dcf_10y",
    ];
    for (const key of dcfKeys) {
      expect(MODEL_LINKS[key]).toBe("/valuation#dcf");
    }
  });

  it("should point trading multiples to #trading-multiples anchor", () => {
    expect(MODEL_LINKS["pe_multiples"]).toBe("/valuation#trading-multiples");
    expect(MODEL_LINKS["ev_ebitda_multiples"]).toBe("/valuation#trading-multiples");
    expect(MODEL_LINKS["ev_revenue_multiples"]).toBe("/valuation#trading-multiples");
  });

  it("should point PEG, EPV, DDM to their respective anchors", () => {
    expect(MODEL_LINKS["peg"]).toBe("/valuation#peg");
    expect(MODEL_LINKS["epv"]).toBe("/valuation#epv");
    expect(MODEL_LINKS["ddm"]).toBe("/valuation#ddm");
  });
});
