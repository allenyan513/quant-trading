/**
 * Data Quality Guard Tests
 *
 * Regression tests for edge cases discovered during the 2026-03-26 audit.
 * These use fixtures (no DB) to verify valuation logic handles tricky inputs.
 */
import { describe, it, expect } from "vitest";
import { calculatePEG } from "../peg.js";
import {
  appleFinancials,
  testEstimates,
  makeFinancial,
} from "./fixtures.js";

// ============================================================
// PEG model edge cases
// ============================================================
describe("PEG model edge cases", () => {
  it("should handle loss-making companies gracefully (N/A)", () => {
    const result = calculatePEG({
      historicals: [
        makeFinancial(2025, { eps: -2, eps_diluted: -2 }),
        makeFinancial(2024, { eps: -1, eps_diluted: -1 }),
      ],
      currentPrice: 50,
      estimates: [],
    });

    expect(result.fair_value).toBe(0);
    expect(result.model_type).toBe("peg");
  });

  it("fair value should be proportional to EPS (not inflated by currency)", () => {
    // Simulate correctly-converted ADR EPS (~$10 USD, not TWD 334)
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
      estimates: testEstimates,
      marketCap: 3e12,
    });

    // PEG fair value should be in the same order of magnitude as price
    // Not 30x+ higher (which would indicate currency mismatch)
    expect(result.fair_value).toBeLessThan(200 * 10);
    expect(result.fair_value).toBeGreaterThan(0);
  });
});
