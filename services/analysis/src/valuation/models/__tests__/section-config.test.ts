import { describe, it, expect } from "vitest";
import { VALUATION_SECTIONS, getSectionsForTier } from "../section-config.js";

describe("VALUATION_SECTIONS", () => {
  it("should have unique section IDs", () => {
    const ids = VALUATION_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-empty labels", () => {
    for (const s of VALUATION_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("should only contain valid tiers", () => {
    const validTiers = new Set(["full", "pre_profit", "none"]);
    for (const s of VALUATION_SECTIONS) {
      for (const t of s.tiers) {
        expect(validTiers.has(t)).toBe(true);
      }
    }
  });
});

describe("getSectionsForTier", () => {
  it("should return all sections for full tier", () => {
    const sections = getSectionsForTier("full");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("summary");
    expect(ids).toContain("dcf");
    expect(ids).toContain("trading-multiples");
    expect(ids).toContain("peg");
    expect(ids).toContain("epv");
    expect(ids).toContain("ddm");
  });

  it("should exclude full-only sections for pre_profit tier", () => {
    const sections = getSectionsForTier("pre_profit");
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("summary");
    expect(ids).toContain("dcf");
    expect(ids).toContain("trading-multiples");
    expect(ids).toContain("ddm");
    // PEG and EPV are full-tier only (earnings-based)
    expect(ids).not.toContain("peg");
    expect(ids).not.toContain("epv");
  });

  it("should return fewer sections for pre_profit than full", () => {
    const full = getSectionsForTier("full");
    const preProfit = getSectionsForTier("pre_profit");
    expect(preProfit.length).toBeLessThan(full.length);
  });

  it("should return no sections for none tier", () => {
    const sections = getSectionsForTier("none");
    expect(sections.length).toBe(0);
  });

  it("should preserve section order", () => {
    const sections = getSectionsForTier("full");
    const ids = sections.map((s) => s.id);
    // Summary should always be first
    expect(ids[0]).toBe("summary");
    // DCF before trading multiples
    expect(ids.indexOf("dcf")).toBeLessThan(ids.indexOf("trading-multiples"));
  });
});
