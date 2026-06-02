import { describe, it, expect } from "vitest";
import { batchKeyOf } from "./deliver.js";

describe("batchKeyOf", () => {
  it("is independent of the order the member ids arrive in", () => {
    const a = batchKeyOf("fmp", "NVDA", "grade_change", ["x", "y", "z"]);
    const b = batchKeyOf("fmp", "NVDA", "grade_change", ["z", "x", "y"]);
    expect(a).toBe(b);
  });

  it("changes when the event set grows (a new member joins)", () => {
    const before = batchKeyOf("fmp", "NVDA", "grade_change", ["a", "b", "c"]);
    const after = batchKeyOf("fmp", "NVDA", "grade_change", ["a", "b", "c", "d"]);
    expect(after).not.toBe(before);
  });

  it("is scoped by source, symbol and event_type", () => {
    const ids = ["a", "b"];
    const base = batchKeyOf("fmp", "NVDA", "grade_change", ids);
    expect(batchKeyOf("other", "NVDA", "grade_change", ids)).not.toBe(base);
    expect(batchKeyOf("fmp", "AAPL", "grade_change", ids)).not.toBe(base);
    expect(batchKeyOf("fmp", "NVDA", "price_target_change", ids)).not.toBe(base);
  });
});
