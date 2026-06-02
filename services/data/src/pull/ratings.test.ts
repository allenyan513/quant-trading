import { describe, it, expect } from "vitest";
import { mapGrades, type FmpGrade } from "./ratings.js";

const W = { from: "2026-05-01", to: "2026-05-31" };
const g = (o: Partial<FmpGrade>): FmpGrade => ({ symbol: "AAPL", date: "2026-05-15", ...o });

describe("mapGrades", () => {
  it("drops no-op maintain (previousGrade === newGrade)", () => {
    const out = mapGrades([g({ action: "maintain", previousGrade: "Buy", newGrade: "Buy" })], W);
    expect(out).toEqual([]);
  });

  it("keeps upgrade and downgrade with correct direction", () => {
    const out = mapGrades(
      [
        g({ symbol: "AAPL", date: "2026-05-10", action: "upgrade", previousGrade: "Hold", newGrade: "Buy", gradingCompany: "X" }),
        g({ symbol: "MSFT", date: "2026-05-11", action: "downgrade", previousGrade: "Buy", newGrade: "Hold", gradingCompany: "Y" }),
      ],
      W,
    );
    const dir = Object.fromEntries(out.map((e) => [e.symbol, e.direction_hint]));
    expect(dir).toEqual({ AAPL: "bullish", MSFT: "bearish" });
  });

  it("keeps a maintain that actually changed grade", () => {
    const out = mapGrades([g({ action: "maintain", previousGrade: "Hold", newGrade: "Buy" })], W);
    expect(out).toHaveLength(1);
  });

  it("drops out-of-window rows", () => {
    const out = mapGrades([g({ date: "2019-01-01", action: "upgrade", previousGrade: "Hold", newGrade: "Buy" })], W);
    expect(out).toEqual([]);
  });

  it("keeps every in-window grade for a symbol (analysis bundles them)", () => {
    const out = mapGrades(
      [
        g({ date: "2026-05-10", action: "upgrade", previousGrade: "Hold", newGrade: "Buy", gradingCompany: "A" }),
        g({ date: "2026-05-20", action: "downgrade", previousGrade: "Buy", newGrade: "Hold", gradingCompany: "B" }),
      ],
      W,
    );
    expect(out).toHaveLength(2);
    // Distinct external_ids so they survive dedup and bundle together downstream.
    expect(new Set(out.map((e) => e.external_id)).size).toBe(2);
    expect(out.map((e) => e.direction_hint)).toEqual(["bullish", "bearish"]);
  });
});
