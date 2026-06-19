import { describe, it, expect } from "vitest";
import { shapeMover, shapeEarnings, shapeEarningsHist, shapeEconEvent, dedupBy } from "./markets.js";

describe("dedupBy", () => {
  it("keeps the first row per key (FMP returns dup calendar rows)", () => {
    const rows = [
      { sym: "NRSNW", date: "2026-06-22", v: 1 },
      { sym: "NRSNW", date: "2026-06-22", v: 2 },
      { sym: "AAPL", date: "2026-06-22", v: 3 },
    ];
    const out = dedupBy(rows, (r) => `${r.sym} ${r.date}`);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.v)).toEqual([1, 3]);
  });
});

describe("shapeMover", () => {
  it("maps an FMP mover row (changesPercentage → changePct)", () => {
    expect(
      shapeMover({ symbol: "AREB", name: "American Rebel", price: 0.255, change: 0.125, changesPercentage: 96.15, exchange: "NASDAQ" }),
    ).toEqual({ symbol: "AREB", name: "American Rebel", price: 0.255, change: 0.125, changePct: 96.15, exchange: "NASDAQ" });
  });
  it("nulls non-numeric / missing fields", () => {
    expect(shapeMover({ symbol: "X" })).toMatchObject({ symbol: "X", name: "", price: null, changePct: null, exchange: null });
  });
});

describe("shapeEarnings", () => {
  it("maps a row and trims the date to YYYY-MM-DD", () => {
    expect(shapeEarnings({ symbol: "AURX", date: "2026-06-29", epsEstimated: -0.01, epsActual: null, revenueEstimated: 1300000, revenueActual: null })).toEqual({
      symbol: "AURX",
      date: "2026-06-29",
      epsEstimated: -0.01,
      epsActual: null,
      revenueEstimated: 1300000,
      revenueActual: null,
    });
  });
});

describe("shapeEarningsHist", () => {
  it("computes beat + positive surprise %", () => {
    const r = shapeEarningsHist({ symbol: "AAPL", date: "2026-03-31", epsEstimated: 2.0, epsActual: 2.2, revenueEstimated: null, revenueActual: null });
    expect(r).toMatchObject({ date: "2026-03-31", beat: true });
    expect(r.surprisePct).toBeCloseTo(10);
  });
  it("computes miss with a negative estimate base (abs denominator)", () => {
    const r = shapeEarningsHist({ symbol: "X", date: "2026-03-31", epsEstimated: -0.5, epsActual: -0.6, revenueEstimated: null, revenueActual: null });
    expect(r.beat).toBe(false);
    expect(r.surprisePct).toBeCloseTo(-20); // (-0.6 - -0.5) / 0.5 * 100
  });
  it("null surprise when no estimate", () => {
    expect(shapeEarningsHist({ symbol: "X", date: "2026-03-31", epsEstimated: null, epsActual: 1, revenueEstimated: null, revenueActual: null })).toMatchObject({ surprisePct: null, beat: null });
  });
});

describe("shapeEconEvent", () => {
  it("maps an FMP economic-calendar row", () => {
    expect(
      shapeEconEvent({ date: "2026-06-25 12:30:00", country: "US", event: "Durable Goods Orders MoM", currency: "USD", previous: 7.9, estimate: -4.7, actual: null, impact: "High", unit: "%" }),
    ).toMatchObject({ date: "2026-06-25 12:30:00", country: "US", event: "Durable Goods Orders MoM", impact: "High", estimate: -4.7, actual: null, unit: "%" });
  });
});
