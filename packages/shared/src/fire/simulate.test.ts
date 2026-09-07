import { describe, it, expect } from "vitest";
import {
  gaussian,
  percentile,
  simulateDet,
  runMC,
  runWithdrawalMC,
  histogram,
} from "./simulate.js";

/**
 * Mulberry32: tiny seeded PRNG so MC tests are reproducible across machines.
 * Returns a function that emits floats in [0, 1).
 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("gaussian", () => {
  it("produces a sample mean ≈ 0 and stddev ≈ 1 over many draws", () => {
    const rand = makeRng(42);
    const N = 20_000;
    const samples = Array.from({ length: N }, () => gaussian(rand));
    const mean = samples.reduce((a, b) => a + b, 0) / N;
    const variance =
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });
});

describe("percentile", () => {
  it("returns null for empty array", () => {
    expect(percentile([], 0.5)).toBeNull();
  });
  it("returns the only element for a singleton array", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.0)).toBe(42);
    expect(percentile([42], 1.0)).toBe(42);
  });
  it("returns endpoints for p=0 and p=1", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
  it("interpolates linearly between adjacent ranks", () => {
    // 4 elements → indices 0..3, p=0.5 → idx 1.5 → halfway between 2 and 3
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
  });
});

describe("simulateDet", () => {
  it("returns reached=true with years=0 when starting capital already covers FI", () => {
    // FI multiplier at swr=0.04 is 25. Need 25 × 12 × monthly target.
    // monthly target $1k, 4% swr → need $300k. Start with $400k → already FI.
    const r = simulateDet(400_000, 0, 1_000, 0.10, 0.04, 0);
    expect(r.reached).toBe(true);
    expect(r.years).toBe(0);
    expect(r.fiMult).toBeCloseTo(25, 10);
  });

  it("compounds toward FI under positive returns and zero inflation", () => {
    // $0 inflation, 8% return, $5k/mo target → FI threshold $1.5M. Solve numerically below.
    const r = simulateDet(100_000, 2_000, 5_000, 0.08, 0.04, 0);
    expect(r.reached).toBe(true);
    expect(r.years!).toBeGreaterThan(15);
    expect(r.years!).toBeLessThan(30);
    // Final balance should hit threshold: 5000 × 12 × 25 = $1.5M
    expect(r.finalBalance!).toBeGreaterThanOrEqual(1_500_000);
  });

  it("returns reached=false when target is unreachable in 80 years", () => {
    // Tiny principal, no contributions, near-zero return, large target.
    const r = simulateDet(1_000, 0, 100_000, 0.001, 0.04, 0);
    expect(r.reached).toBe(false);
    expect(r.fiMult).toBeCloseTo(25, 10);
  });

  it("inflation pushes the FI bar higher each month", () => {
    // Same principal/contribution, only inflation differs → higher inflation = longer.
    const noInfl = simulateDet(50_000, 1_500, 4_000, 0.08, 0.04, 0);
    const withInfl = simulateDet(50_000, 1_500, 4_000, 0.08, 0.04, 0.04);
    expect(noInfl.reached && withInfl.reached).toBe(true);
    expect(withInfl.years!).toBeGreaterThan(noInfl.years!);
  });
});

describe("runMC", () => {
  it("returns nSims paths total (successes + failures = nSims)", () => {
    const rand = makeRng(7);
    const r = runMC(100_000, 1_000, 4_000, 0.08, 0.16, 0.04, 0.03, 200, 60, rand);
    expect(r.nSims).toBe(200);
    expect(r.yearsToFI.length + r.failures).toBe(200);
  });

  it("p10 ≤ p50 ≤ p90 (when enough successes)", () => {
    const rand = makeRng(123);
    const r = runMC(200_000, 2_000, 5_000, 0.10, 0.16, 0.04, 0.03, 500, 60, rand);
    expect(r.successRate).toBeGreaterThan(0.5);
    expect(r.p10!).toBeLessThanOrEqual(r.p50!);
    expect(r.p50!).toBeLessThanOrEqual(r.p90!);
  });

  it("fanData spans years 0..maxYears with monotone P50 (median balance grows)", () => {
    const rand = makeRng(99);
    const maxYears = 30;
    const r = runMC(100_000, 1_500, 4_000, 0.08, 0.14, 0.04, 0.03, 300, maxYears, rand);
    expect(r.fanData.length).toBe(maxYears + 1);
    expect(r.fanData[0]?.p50).toBe(100_000);
    // Median should generally trend up with positive expected return + contributions.
    const half = Math.floor(maxYears / 2);
    expect(r.fanData[maxYears]?.p50 ?? 0).toBeGreaterThan(r.fanData[half]?.p50 ?? 0);
  });
});

describe("runWithdrawalMC", () => {
  it("4% rule on a 25× balance gives a high (>80%) 30-year success rate", () => {
    const rand = makeRng(2024);
    const startBalance = 1_000_000;
    const annualW = 40_000; // exactly 4%
    const r = runWithdrawalMC(startBalance, annualW, 0.10, 0.16, 0.03, 1000, 30, rand);
    expect(r.successRate).toBeGreaterThan(0.8);
    expect(r.successRate + r.bustRate).toBeCloseTo(1, 10);
  });

  it("over-withdrawing (10% of balance/yr) gives a low success rate", () => {
    const rand = makeRng(2025);
    const r = runWithdrawalMC(1_000_000, 100_000, 0.08, 0.16, 0.03, 500, 30, rand);
    expect(r.successRate).toBeLessThan(0.5);
  });
});

describe("histogram", () => {
  it("returns [] for empty input", () => {
    expect(histogram([])).toEqual([]);
  });

  it("places every input into exactly one bin (counts sum to N)", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    const bins = histogram(sorted, 10);
    expect(bins).toHaveLength(10);
    const total = bins.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(100);
  });

  it("clamps the max value into the last bin (no overflow)", () => {
    // For uniform 1..100 with 10 bins, value 100 must land in bin 9.
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    const bins = histogram(sorted, 10);
    expect(bins[9]?.count ?? 0).toBeGreaterThan(0);
  });
});
