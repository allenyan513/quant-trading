import { describe, it, expect } from "vitest";
import {
  computeNavIndexChain,
  computeDailyReturn,
  equityToFlexNav,
  computePositionMarketValue,
  computePositionWeightPct,
} from "./sync.js";
import { parseTradesReport, parsePositionsReport, type FlexNavRow } from "@qt/shared";

const nav = (o: Partial<FlexNavRow>): FlexNavRow => ({
  date: "2026-06-10",
  startingNav: 0,
  endingNav: 0,
  mtmPnl: 0,
  depositsWithdrawals: 0,
  twrPct: 0,
  ...o,
});

describe("computeNavIndexChain", () => {
  it("compounds returns onto the prior index", () => {
    const out = computeNavIndexChain(100, [0.1, -0.05]);
    expect(out[0]).toBeCloseTo(110);
    expect(out[1]).toBeCloseTo(104.5);
  });
  it("seeds at 100 with no prior history", () => {
    expect(computeNavIndexChain(100, [0])).toEqual([100]);
  });
  it("returns [] for no returns", () => {
    expect(computeNavIndexChain(100, [])).toEqual([]);
  });
});

describe("computeDailyReturn", () => {
  it("trusts IBKR's TWR percent when present", () => {
    expect(computeDailyReturn(nav({ twrPct: 1.5 }))).toBeCloseTo(0.015);
  });
  it("falls back to ending/starting NAV minus flows", () => {
    // (110 - 100 - 0) / 100 = 0.10
    expect(computeDailyReturn(nav({ startingNav: 100, endingNav: 110, twrPct: 0 }))).toBeCloseTo(0.1);
  });
  it("nets out deposits in the fallback", () => {
    // (150 - 100 - 50) / 100 = 0 — a pure deposit isn't a return
    expect(
      computeDailyReturn(nav({ startingNav: 100, endingNav: 150, depositsWithdrawals: 50, twrPct: 0 })),
    ).toBeCloseTo(0);
  });
  it("returns 0 when starting NAV is non-positive", () => {
    expect(computeDailyReturn(nav({ startingNav: 0, endingNav: 10, twrPct: 0 }))).toBe(0);
  });
});

describe("equityToFlexNav", () => {
  it("derives day-over-day returns, first row seeds the chain", () => {
    const out = equityToFlexNav([
      { date: "2026-06-10", totalNav: 100 },
      { date: "2026-06-11", totalNav: 110 },
      { date: "2026-06-12", totalNav: 99 },
    ]);
    expect(out).toHaveLength(2); // first row produces no return row
    expect(out[0]!.date).toBe("2026-06-11");
    expect(out[0]!.twrPct).toBeCloseTo(10); // +10%
    expect(out[1]!.twrPct).toBeCloseTo(-10); // 99/110 - 1
  });
  it("returns [] with fewer than 2 snapshots", () => {
    expect(equityToFlexNav([{ date: "2026-06-10", totalNav: 100 }])).toEqual([]);
  });
});

describe("computePositionMarketValue", () => {
  it("applies the 100x multiplier for options", () => {
    expect(
      computePositionMarketValue({ assetClass: "OPT", quantity: 2, markPrice: 3.5, positionValue: 0 }),
    ).toBe(700); // 3.5 * 100 * 2
  });
  it("uses qty × mark for equities", () => {
    expect(
      computePositionMarketValue({ assetClass: "STK", quantity: 10, markPrice: 50, positionValue: 0 }),
    ).toBe(500);
  });
  it("falls back to positionValue when markPrice is absent", () => {
    expect(
      computePositionMarketValue({ assetClass: "STK", quantity: 10, positionValue: 480 }),
    ).toBe(480);
  });
});

describe("computePositionWeightPct", () => {
  it("computes weight as % of NAV", () => {
    expect(computePositionWeightPct(2500, 100000)).toBeCloseTo(2.5);
  });
  it("returns 0 when NAV is unknown", () => {
    expect(computePositionWeightPct(2500, null)).toBe(0);
  });
  it("goes negative for short positions (negative market value)", () => {
    expect(computePositionWeightPct(-2500, 100000)).toBeCloseTo(-2.5);
  });
});

// ── parser tests (canned Flex XML) ──────────────────────────────────

describe("parseTradesReport", () => {
  const xml = `<FlexQueryResponse><FlexStatements><FlexStatement>
    <Trades>
      <Trade levelOfDetail="EXECUTION" tradeID="111" assetCategory="STK" symbol="AAPL" buySell="BUY" quantity="10" tradePrice="190.5" tradeDate="20260610" />
      <Trade levelOfDetail="ORDER" tradeID="111" assetCategory="STK" symbol="AAPL" buySell="BUY" quantity="10" tradePrice="190.5" tradeDate="20260610" />
      <Trade levelOfDetail="EXECUTION" tradeID="222" assetCategory="OPT" symbol="MSFT  260417C00400000" underlyingSymbol="MSFT" putCall="C" strike="400" expiry="20260417" buySell="SELL" quantity="-1" tradePrice="5.2" tradeDate="20260610" />
    </Trades></FlexStatement></FlexStatements></FlexQueryResponse>`;

  it("keeps only EXECUTION rows and parses fields", () => {
    const rows = parseTradesReport(xml);
    expect(rows).toHaveLength(2); // ORDER duplicate dropped
    expect(rows[0]).toMatchObject({ externalTradeId: "111", symbol: "AAPL", action: "BUY", quantity: 10, tradeDate: "2026-06-10" });
  });
  it("uses the plain underlying ticker + structured option fields", () => {
    const opt = parseTradesReport(xml).find((r) => r.assetClass === "OPT")!;
    expect(opt.symbol).toBe("MSFT");
    expect(opt).toMatchObject({ optionType: "CALL", strike: 400, expiry: "2026-04-17", quantity: -1 });
  });
});

describe("parsePositionsReport", () => {
  it("keeps SUMMARY rows and merges Greeks from LOT rows", () => {
    const xml = `<FlexQueryResponse><FlexStatements><FlexStatement>
      <OpenPositions>
        <OpenPosition levelOfDetail="SUMMARY" reportDate="20260610" assetCategory="OPT" symbol="NVDA  260417P00100000" underlyingSymbol="NVDA" putCall="P" strike="100" expiry="20260417" position="-2" positionValue="-1500" markPrice="7.5" />
        <OpenPosition levelOfDetail="LOT" reportDate="20260610" assetCategory="OPT" underlyingSymbol="NVDA" putCall="P" strike="100" expiry="20260417" delta="-0.3" gamma="0.01" theta="-0.05" vega="0.2" />
        <OpenPosition levelOfDetail="SUMMARY" reportDate="20260610" assetCategory="STK" symbol="AAPL" position="10" positionValue="1905" markPrice="190.5" />
      </OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>`;
    const rows = parsePositionsReport(xml);
    expect(rows).toHaveLength(2); // LOT row not emitted as its own position
    const opt = rows.find((r) => r.assetClass === "OPT")!;
    expect(opt).toMatchObject({ symbol: "NVDA", optionType: "PUT", quantity: -2, delta: -0.3, vega: 0.2 });
    const stk = rows.find((r) => r.assetClass === "STK")!;
    expect(stk).toMatchObject({ symbol: "AAPL", quantity: 10, markPrice: 190.5 });
  });
});
