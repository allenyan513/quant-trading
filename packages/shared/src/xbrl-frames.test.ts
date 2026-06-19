import { describe, it, expect } from "vitest";
import { mergeFramesByCik, scoreYoyGrowth, rankByGrowth, priorYear, settledPeriod, type FrameResponse, type GrowthScore } from "./xbrl-frames.js";

const frame = (pts: Array<{ cik: number; val: number; end?: string; entityName?: string }>): FrameResponse => ({
  taxonomy: "us-gaap",
  tag: "x",
  pts: pts.length,
  data: pts.map((p) => ({ accn: "a", cik: p.cik, entityName: p.entityName ?? `E${p.cik}`, end: p.end ?? "2025-09-30", val: p.val })),
});

describe("priorYear", () => {
  it("steps the year back one, keeps the quarter", () => {
    expect(priorYear("CY2025Q3")).toBe("CY2024Q3");
    expect(priorYear("CY2026Q1")).toBe("CY2025Q1");
  });
});

describe("settledPeriod", () => {
  it("returns the most recent quarter completed before today − lag", () => {
    // 2026-06-19 − 75d ≈ 2026-04-05 (Q2) → most recent completed quarter = Q1 2026
    expect(settledPeriod(new Date("2026-06-19T00:00:00Z"), 75)).toBe("CY2026Q1");
    // a larger lag rolls back to Q4 of the prior year
    expect(settledPeriod(new Date("2026-06-19T00:00:00Z"), 120)).toBe("CY2025Q4");
  });
  it("wraps across the year boundary", () => {
    expect(settledPeriod(new Date("2026-02-15T00:00:00Z"), 75)).toBe("CY2025Q3");
  });
});

describe("mergeFramesByCik", () => {
  it("first tag with a value for a cik wins; lower tags fill gaps; null skipped", () => {
    const high = frame([{ cik: 1, val: 100 }]); // tag A covers cik 1
    const low = frame([{ cik: 1, val: 999 }, { cik: 2, val: 50 }]); // tag B covers 1 (loses) + 2 (fills)
    const m = mergeFramesByCik([{ tag: "A", resp: high }, { tag: "B", resp: low }, { tag: "C", resp: null }]);
    expect(m.get(1)).toMatchObject({ val: 100, tag: "A" }); // higher-priority tag wins
    expect(m.get(2)).toMatchObject({ val: 50, tag: "B" }); // gap filled by lower tag
    expect(m.size).toBe(2);
  });
});

describe("scoreYoyGrowth", () => {
  const now = mergeFramesByCik([{ tag: "R", resp: frame([{ cik: 1, val: 150 }, { cik: 2, val: 200 }, { cik: 3, val: 300 }]) }]);
  it("computes growth, inner-joins on cik", () => {
    const ago = mergeFramesByCik([{ tag: "R", resp: frame([{ cik: 1, val: 100 }, { cik: 2, val: 100 }]) }]); // cik 3 missing
    const s = scoreYoyGrowth(now, ago, { minBase: 0 });
    expect(s).toHaveLength(2); // cik 3 dropped (only in `now`)
    expect(s.find((x) => x.cik === 1)!.growth).toBeCloseTo(0.5);
    expect(s.find((x) => x.cik === 2)!.growth).toBeCloseTo(1.0);
  });
  it("drops ciks below the size floor and with a non-positive base", () => {
    const ago = mergeFramesByCik([{ tag: "R", resp: frame([{ cik: 1, val: 100 }, { cik: 2, val: 0 }]) }]);
    expect(scoreYoyGrowth(now, ago, { minBase: 150 })).toHaveLength(0); // cik1 base<floor, cik2 base=0
  });
});

describe("rankByGrowth", () => {
  const s: GrowthScore[] = [
    { cik: 1, valNow: 0, valAgo: 0, growth: 0.1, entityName: "" },
    { cik: 2, valNow: 0, valAgo: 0, growth: 0.5, entityName: "" },
    { cik: 3, valNow: 0, valAgo: 0, growth: 0.3, entityName: "" },
  ];
  it("filters by floor, sorts desc, slices topN", () => {
    expect(rankByGrowth(s, { topN: 2, minGrowthPct: 0.2 }).map((x) => x.cik)).toEqual([2, 3]);
  });
});
