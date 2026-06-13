import { describe, it, expect } from "vitest";
import { isSnapshotFresh, verdictFromUpside } from "./reference.js";

describe("isSnapshotFresh", () => {
  const now = new Date("2026-05-30T12:00:00Z");
  it("fresh within the TTL window", () => {
    expect(isSnapshotFresh(new Date("2026-05-30T02:00:00Z"), now, 1)).toBe(true); // 10h < 1d
  });
  it("stale past the TTL window", () => {
    expect(isSnapshotFresh(new Date("2026-05-28T12:00:00Z"), now, 1)).toBe(false); // 2d > 1d
  });
  it("respects a larger TTL", () => {
    expect(isSnapshotFresh(new Date("2026-05-28T12:00:00Z"), now, 3)).toBe(true); // 2d <= 3d
  });
});

describe("verdictFromUpside", () => {
  it("null upside → null verdict", () => {
    expect(verdictFromUpside(null)).toBeNull();
  });
  it("> +15% → undervalued", () => {
    expect(verdictFromUpside(20)).toBe("undervalued");
  });
  it("< -15% → overvalued", () => {
    expect(verdictFromUpside(-30)).toBe("overvalued");
  });
  it("within ±15% → fairly_valued", () => {
    expect(verdictFromUpside(5)).toBe("fairly_valued");
    expect(verdictFromUpside(-15)).toBe("fairly_valued"); // boundary inclusive
  });
});
