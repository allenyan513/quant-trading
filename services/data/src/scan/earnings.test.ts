import { describe, it, expect } from "vitest";
import { selectEarningsCandidates } from "./earnings.js";
import type { FmpEarning } from "../pull/earnings.js";

const e = (o: Partial<FmpEarning>): FmpEarning => ({ symbol: "X", date: "2026-05-01", ...o });

describe("selectEarningsCandidates", () => {
  const watch = ["AAPL", "MSFT"];

  it("flags a big non-watchlist surprise", () => {
    const out = selectEarningsCandidates([e({ symbol: "ABCD", epsActual: 1.5, epsEstimated: 1.0 })], watch, 0.2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: "ABCD", source: "earnings_surprise", score: 0.5 });
  });

  it("excludes symbols already on the watchlist", () => {
    expect(selectEarningsCandidates([e({ symbol: "AAPL", epsActual: 2, epsEstimated: 1 })], watch, 0.2)).toEqual([]);
  });

  it("drops surprises below the threshold", () => {
    expect(selectEarningsCandidates([e({ symbol: "ABCD", epsActual: 1.05, epsEstimated: 1.0 })], watch, 0.2)).toEqual([]);
  });

  it("skips rows with no actual or no/zero estimate", () => {
    const rows = [
      e({ symbol: "AA", epsActual: null, epsEstimated: 1 }),
      e({ symbol: "BB", epsActual: 2, epsEstimated: null }),
      e({ symbol: "CC", epsActual: 2, epsEstimated: 0 }),
    ];
    expect(selectEarningsCandidates(rows, watch, 0.2)).toEqual([]);
  });

  it("flags large negative surprises too (magnitude)", () => {
    const out = selectEarningsCandidates([e({ symbol: "ABCD", epsActual: 0.5, epsEstimated: 1.0 })], watch, 0.2);
    expect(out[0]).toMatchObject({ symbol: "ABCD", score: 0.5 });
    expect(out[0]!.discoveryReason).toContain("-50.0%");
  });

  it("does not sign-flip on a negative estimate (narrowing loss is a beat, #54)", () => {
    // est −1.00 → actual −0.50: a narrowing loss. Raw actual/est−1 = −0.5 (looks
    // like a miss); the signed numerator correctly reads it as a +50% beat.
    const out = selectEarningsCandidates([e({ symbol: "ABCD", epsActual: -0.5, epsEstimated: -1.0 })], watch, 0.2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: "ABCD", score: 0.5 });
    expect(out[0]!.discoveryReason).toContain("+50.0%");
  });

  it("reads a loss→profit swing as a large beat, not a huge miss (#54)", () => {
    // est −0.02 → actual +0.30. Raw actual/est−1 = −16 (massive false miss);
    // signed over floored |est| (0.05) = +6.4 → a real, positive surprise.
    const out = selectEarningsCandidates([e({ symbol: "ABCD", epsActual: 0.3, epsEstimated: -0.02 })], watch, 0.2);
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBeCloseTo(6.4, 10);
    expect(out[0]!.discoveryReason).toContain("+640.0%");
  });

  it("floors a near-zero estimate so the magnitude doesn't blow up (#54)", () => {
    // est 0.01 → actual 0.50. Raw actual/est−1 = 49 (4900%); flooring |est| at
    // 0.05 tames it to 9.8 (980%).
    const out = selectEarningsCandidates([e({ symbol: "ABCD", epsActual: 0.5, epsEstimated: 0.01 })], watch, 0.2);
    expect(out[0]!.score).toBeCloseTo(9.8, 10);
    expect(out[0]!.discoveryReason).toContain("+980.0%");
  });

  it("keeps the biggest surprise per symbol", () => {
    const rows = [
      e({ symbol: "ABCD", date: "2026-05-01", epsActual: 1.3, epsEstimated: 1.0 }),
      e({ symbol: "ABCD", date: "2026-05-02", epsActual: 2.0, epsEstimated: 1.0 }),
    ];
    const out = selectEarningsCandidates(rows, watch, 0.2);
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBeCloseTo(1.0, 10);
  });
});
