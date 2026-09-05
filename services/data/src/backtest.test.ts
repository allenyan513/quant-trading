import { describe, it, expect } from "vitest";
import { parseBacktestRequest, toDividend, MAX_HOLDINGS, MAX_YEARS } from "./backtest.js";

const base = { holdings: [{ symbol: "schd", weight: 60 }], from: "2020-01-01", to: "2024-01-01" };

describe("parseBacktestRequest", () => {
  it("normalizes symbols and defaults initial + reinvest", () => {
    const r = parseBacktestRequest({ ...base });
    expect(r.holdings).toEqual([{ symbol: "SCHD", weight: 60 }]);
    expect(r.initial).toBe(10_000);
    expect(r.reinvest).toBe(true);
  });

  it("defaults `to` to today when omitted", () => {
    const r = parseBacktestRequest({ holdings: base.holdings, from: "2020-01-01" });
    expect(r.to).toBe(new Date().toISOString().slice(0, 10));
  });

  it("honours reinvest: false", () => {
    expect(parseBacktestRequest({ ...base, reinvest: false }).reinvest).toBe(false);
  });

  it("rejects bad symbols, duplicates and empty baskets", () => {
    expect(() => parseBacktestRequest({ ...base, holdings: [] })).toThrow(/at least one holding/);
    expect(() => parseBacktestRequest({ ...base, holdings: [{ symbol: "A B", weight: 1 }] })).toThrow(/invalid symbol/);
    expect(() =>
      parseBacktestRequest({ ...base, holdings: [{ symbol: "VYM", weight: 1 }, { symbol: "vym", weight: 1 }] }),
    ).toThrow(/duplicate symbol/);
    const many = Array.from({ length: MAX_HOLDINGS + 1 }, (_, i) => ({ symbol: `SY${i}`, weight: 1 }));
    expect(() => parseBacktestRequest({ ...base, holdings: many })).toThrow(/at most/);
  });

  it("rejects zero weights, bad dates and over-long windows", () => {
    expect(() => parseBacktestRequest({ ...base, holdings: [{ symbol: "SCHD", weight: 0 }] })).toThrow(/weights/);
    expect(() => parseBacktestRequest({ ...base, from: "01/01/2020" })).toThrow(/YYYY-MM-DD/);
    expect(() => parseBacktestRequest({ ...base, from: "2024-01-01", to: "2020-01-01" })).toThrow(/before/);
    expect(() => parseBacktestRequest({ ...base, from: "2000-01-01", to: "2024-01-01" })).toThrow(
      new RegExp(`${MAX_YEARS} years`),
    );
  });

  it("accepts exactly MAX_YEARS of history — the tool's own default window", () => {
    const to = "2026-09-05";
    const from = `${2026 - MAX_YEARS}-09-05`;
    expect(parseBacktestRequest({ holdings: base.holdings, from, to }).from).toBe(from);
    // One day earlier is over the cap.
    expect(() => parseBacktestRequest({ holdings: base.holdings, from: `${2026 - MAX_YEARS}-09-04`, to })).toThrow(
      /capped/,
    );
  });

  it("rejects a non-positive initial investment", () => {
    expect(() => parseBacktestRequest({ ...base, initial: 0 })).toThrow(/positive/);
    expect(() => parseBacktestRequest({ ...base, initial: -5 })).toThrow(/positive/);
  });
});

describe("toDividend", () => {
  it("prefers the split-adjusted amount over the raw one", () => {
    // AAPL 2014: $3.29 raw, $0.1175 after the 7:1 and 4:1 splits. The price series
    // is split-adjusted, so only the adjusted amount is consistent with it.
    expect(toDividend({ data: { date: "2014-05-08", dividend: 3.29, adjDividend: 0.1175 } })).toEqual({
      exDate: "2014-05-08",
      amount: 0.1175,
    });
  });

  it("falls back to the raw amount and skips unusable rows", () => {
    expect(toDividend({ data: { date: "2024-03-01", dividend: 0.5 } })).toEqual({ exDate: "2024-03-01", amount: 0.5 });
    expect(toDividend({ data: { date: "0000-00-00", dividend: 0.5 } })).toBeNull();
    expect(toDividend({ data: { date: "2024-03-01" } })).toBeNull();
    expect(toDividend({ data: { date: "2024-03-01", dividend: 0 } })).toBeNull();
  });
});
