import { describe, it, expect } from "vitest";
import { median, percentiles, computePercentile, round2 } from "../statistics.js";

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single element for length-1 array", () => {
    expect(median([42])).toBe(42);
  });

  it("returns the middle element for odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it("returns average of two middle elements for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles unsorted input", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("handles negative values", () => {
    expect(median([-10, 0, 10])).toBe(0);
  });

  it("does not mutate original array", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe("percentiles", () => {
  it("returns fallback ±30% when array is empty", () => {
    const result = percentiles([], 100);
    expect(result.p25).toBe(70);
    expect(result.p75).toBe(130);
  });

  it("calculates p25 and p75 for sorted data", () => {
    // 10 elements: [1,2,3,4,5,6,7,8,9,10]
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = percentiles(data, 5);
    // p25 = index 2 → 3, p75 = index 7 → 8
    expect(result.p25).toBe(3);
    expect(result.p75).toBe(8);
  });

  it("handles unsorted input", () => {
    const data = [10, 1, 5, 3, 8, 2, 7, 4, 9, 6];
    const result = percentiles(data, 5);
    expect(result.p25).toBe(3);
    expect(result.p75).toBe(8);
  });

  it("does not mutate original array", () => {
    const arr = [5, 1, 3];
    percentiles(arr, 3);
    expect(arr).toEqual([5, 1, 3]);
  });
});

describe("computePercentile", () => {
  it("returns 0 for the smallest value", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 1)).toBe(0);
  });

  it("returns 80 for the largest in 5-element array", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 5)).toBe(80);
  });

  it("returns correct percentile for middle value", () => {
    // 2 values below 3 out of 5 = 40%
    expect(computePercentile([1, 2, 3, 4, 5], 3)).toBe(40);
  });

  it("handles value not in array", () => {
    // 3 values below 3.5 out of 5 = 60%
    expect(computePercentile([1, 2, 3, 4, 5], 3.5)).toBe(60);
  });
});

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(1.2345)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    // 1.005 is a known JS floating-point edge case: Math.round(1.005 * 100) = 100, not 101
    expect(round2(1.005)).toBe(1);
    expect(round2(1.256)).toBe(1.26);
  });

  it("handles integers", () => {
    expect(round2(42)).toBe(42);
  });

  it("handles negative numbers", () => {
    expect(round2(-1.567)).toBe(-1.57);
  });
});
