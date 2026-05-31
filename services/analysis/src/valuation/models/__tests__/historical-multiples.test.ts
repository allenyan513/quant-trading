import { describe, it, expect } from "vitest";
import {
  computeHistoricalMultiples,
  computeMultiplesStats,
  sampleData,
} from "../historical-multiples.js";
import { appleFinancials, generateHistoricalMultiples } from "./fixtures.js";

describe("computeHistoricalMultiples", () => {
  // Build mock prices aligned with financial years
  const mockPrices = Array.from({ length: 300 }, (_, i) => ({
    date: new Date(2024, 3, 1 + i).toISOString().split("T")[0], // Start April 2024
    close: 180 + Math.sin(i / 20) * 20,
  }));

  it("should compute P/E and EV/EBITDA for each price point", () => {
    const result = computeHistoricalMultiples(appleFinancials, mockPrices);

    expect(result.length).toBeGreaterThan(0);
    const point = result[0];
    expect(point.date).toBeTruthy();
    expect(point.pe).not.toBeNull();
    expect(point.ev_ebitda).not.toBeNull();
  });

  it("should return empty when no financials", () => {
    const result = computeHistoricalMultiples([], mockPrices);
    expect(result).toHaveLength(0);
  });

  it("should return empty when no prices", () => {
    const result = computeHistoricalMultiples(appleFinancials, []);
    expect(result).toHaveLength(0);
  });

  it("should compute P/E = price / EPS", () => {
    const result = computeHistoricalMultiples(appleFinancials, mockPrices);
    const point = result[0];
    if (point.pe !== null) {
      // P/E should be reasonable (price ~180 / EPS ~6 = ~30)
      expect(point.pe).toBeGreaterThan(15);
      expect(point.pe).toBeLessThan(50);
    }
  });

  it("should skip prices where no applicable financial exists", () => {
    // Prices from 2018 — no financials available that old
    const oldPrices = [
      { date: "2018-06-01", close: 100 },
      { date: "2018-07-01", close: 105 },
    ];
    const result = computeHistoricalMultiples(appleFinancials, oldPrices);
    expect(result).toHaveLength(0);
  });
});

describe("computeMultiplesStats", () => {
  it("should compute avg, p25, p75, percentile", () => {
    const data = generateHistoricalMultiples(500, 25);
    const stats = computeMultiplesStats(data);

    expect(stats.pe).not.toBeNull();
    expect(stats.pe!.avg5y).toBeGreaterThan(20);
    expect(stats.pe!.avg5y).toBeLessThan(30);
    expect(stats.pe!.p25).toBeLessThanOrEqual(stats.pe!.avg5y);
    expect(stats.pe!.p75).toBeGreaterThanOrEqual(stats.pe!.avg5y);
    expect(stats.pe!.percentile).toBeGreaterThanOrEqual(0);
    expect(stats.pe!.percentile).toBeLessThanOrEqual(100);
    expect(stats.pe!.dataPoints).toBe(500);
  });

  it("should return null when fewer than 10 data points", () => {
    const data = generateHistoricalMultiples(5, 25);
    const stats = computeMultiplesStats(data);

    expect(stats.pe).toBeNull();
  });

  it("should filter out values above cap", () => {
    const data = generateHistoricalMultiples(200, 25);
    // Inject extreme values
    data[0] = { ...data[0], pe: 500 };
    data[1] = { ...data[1], pe: -10 };

    const stats = computeMultiplesStats(data);
    // Extreme values should be filtered, stats should still be valid
    expect(stats.pe).not.toBeNull();
    expect(stats.pe!.avg5y).toBeGreaterThan(0);
    expect(stats.pe!.avg5y).toBeLessThan(50);
  });
});

describe("sampleData", () => {
  it("should return original data when under limit", () => {
    const data = generateHistoricalMultiples(50, 25);
    const sampled = sampleData(data, 250);
    expect(sampled).toHaveLength(50);
  });

  it("should downsample to target size", () => {
    const data = generateHistoricalMultiples(1000, 25);
    const sampled = sampleData(data, 250);
    expect(sampled).toHaveLength(250);
  });

  it("should preserve first and last points", () => {
    const data = generateHistoricalMultiples(1000, 25);
    const sampled = sampleData(data, 100);
    expect(sampled[0].date).toBe(data[0].date);
    expect(sampled[sampled.length - 1].date).toBe(data[data.length - 1].date);
  });
});
