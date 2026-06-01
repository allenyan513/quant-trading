import { describe, it, expect } from "vitest";
import { isOutOfSample } from "./validation.js";

const cutoff = 1_000;

describe("isOutOfSample", () => {
  it("is out-of-sample when every event post-dates the cutoff", () => {
    expect(isOutOfSample([1_001, 2_000], cutoff)).toBe(true);
  });

  it("is in-sample if any event predates (or equals) the cutoff", () => {
    expect(isOutOfSample([2_000, 999], cutoff)).toBe(false);
    expect(isOutOfSample([1_000], cutoff)).toBe(false); // boundary: not strictly after
  });

  it("is undetermined (null) with no events", () => {
    expect(isOutOfSample([], cutoff)).toBeNull();
  });

  it("is undetermined (null) when any observed-at is missing", () => {
    expect(isOutOfSample([2_000, null], cutoff)).toBeNull();
  });
});
