import { describe, it, expect } from "vitest";
import { shapeMover, shapeEarnings, shapeEconEvent } from "./markets.js";

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

describe("shapeEconEvent", () => {
  it("maps an FMP economic-calendar row", () => {
    expect(
      shapeEconEvent({ date: "2026-06-25 12:30:00", country: "US", event: "Durable Goods Orders MoM", currency: "USD", previous: 7.9, estimate: -4.7, actual: null, impact: "High", unit: "%" }),
    ).toMatchObject({ date: "2026-06-25 12:30:00", country: "US", event: "Durable Goods Orders MoM", impact: "High", estimate: -4.7, actual: null, unit: "%" });
  });
});
