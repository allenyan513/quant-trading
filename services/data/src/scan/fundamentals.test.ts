import { describe, it, expect } from "vitest";
import { selectFundamentalCandidates } from "./fundamentals.js";
import type { GrowthScore } from "@qt/shared/xbrl-frames";

const score = (cik: number, growth: number): GrowthScore => ({ cik, valNow: 200e6, valAgo: 100e6, growth, entityName: `E${cik}` });

describe("selectFundamentalCandidates", () => {
  it("drops no-ticker ciks BEFORE topN (they don't consume a slot)", () => {
    const scores = [score(1, 0.9), score(2, 0.8), score(3, 0.7)]; // cik 2 has no ticker
    const map = new Map<number, string>([
      [1, "AAA"],
      [3, "CCC"],
    ]);
    const c = selectFundamentalCandidates(scores, map, { period: "CY2025Q3", topN: 2, minGrowthPct: 0.25 });
    expect(c.map((x) => x.symbol)).toEqual(["AAA", "CCC"]); // cik2 skipped; both ticker'd survive topN=2
  });

  it("shapes the candidate (source/score/detail)", () => {
    const c = selectFundamentalCandidates([score(1, 0.5)], new Map([[1, "AAA"]]), { period: "CY2025Q3", topN: 5, minGrowthPct: 0.25 });
    expect(c[0]).toMatchObject({ symbol: "AAA", source: "fundamental_screen", score: 0.5 });
    expect(c[0]!.detail).toMatchObject({ screen: "revenue_growth", period: "CY2025Q3", growth: 0.5 });
  });

  it("applies the growth floor", () => {
    expect(selectFundamentalCandidates([score(1, 0.1)], new Map([[1, "AAA"]]), { period: "CY2025Q3", topN: 5, minGrowthPct: 0.25 })).toHaveLength(0);
  });

  it("dedups two CIKs that resolve to one ticker (keeps the higher-growth one)", () => {
    const scores = [score(1, 0.5), score(2, 0.9)]; // both CIKs → "DUP"
    const map = new Map<number, string>([[1, "DUP"], [2, "DUP"]]);
    const c = selectFundamentalCandidates(scores, map, { period: "CY2025Q3", topN: 5, minGrowthPct: 0.25 });
    expect(c).toHaveLength(1);
    expect(c[0]!.score).toBe(0.9);
  });
});
