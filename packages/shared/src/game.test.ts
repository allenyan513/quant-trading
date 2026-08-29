import { describe, it, expect } from "vitest";
import {
  newGame,
  pickWindow,
  placeOrder,
  cancelOrder,
  nextDay,
  computeKpis,
  maxBuyable,
  cagr,
  pickFundamental,
  computeQuote,
  INITIAL_CASH,
  type GameBar,
} from "./game.js";

/** Bars with an easy-to-reason-about ramp: open == close == 100 + i. */
function ramp(n: number): GameBar[] {
  return Array.from({ length: n }, (_, i) => {
    const p = 100 + i;
    return { d: `2021-01-${String(i + 1).padStart(2, "0")}`, o: p, h: p, l: p, c: p, v: 1000 };
  });
}

describe("pickWindow", () => {
  it("respects minDays and stays inside the series", () => {
    const rand = () => 0.5;
    const { startIndex, endIndex } = pickWindow(2000, { minDays: 250, maxDays: 1000, rand });
    expect(endIndex - startIndex).toBeGreaterThanOrEqual(250);
    expect(endIndex).toBeLessThan(2000);
    expect(startIndex).toBeGreaterThanOrEqual(0);
  });

  it("falls back to the whole series when history is too short", () => {
    expect(pickWindow(100, { minDays: 250 })).toEqual({ startIndex: 0, endIndex: 99 });
  });

  it("honors earliestIndex so the game opens inside the covered era", () => {
    for (const r of [0.01, 0.5, 0.99]) {
      const { startIndex } = pickWindow(2000, { earliestIndex: 1200, minDays: 250, maxDays: 500, rand: () => r });
      expect(startIndex).toBeGreaterThanOrEqual(1200);
      expect(startIndex).toBeLessThan(2000);
    }
  });

  it("ignores an earliestIndex that leaves less than minDays of runway", () => {
    // Floor at 1990 of 2000 bars would leave a 10-bar game; back off instead.
    const { startIndex, endIndex } = pickWindow(2000, { earliestIndex: 1990, minDays: 250 });
    expect(startIndex).toBeLessThanOrEqual(1749);
    expect(endIndex - startIndex).toBeGreaterThanOrEqual(250);
  });

  it("varies the end so buy-and-hold can't count on a fixed horizon", () => {
    const a = pickWindow(2000, { rand: () => 0.1 });
    const b = pickWindow(2000, { rand: () => 0.9 });
    expect(a.endIndex - a.startIndex).not.toBe(b.endIndex - b.startIndex);
  });
});

describe("order placement", () => {
  const bars = ramp(10);

  it("queues a buy without touching cash (fills at the next open)", () => {
    const g = newGame("NVDA", 0, 9);
    const { state, reason } = placeOrder(g, { side: "buy", shares: 10 }, bars[1]!.o);
    expect(reason).toBeNull();
    expect(state.pending).toEqual({ side: "buy", shares: 10 });
    expect(state.cash).toBe(INITIAL_CASH);
    expect(state.shares).toBe(0);
  });

  it("rejects selling more than held", () => {
    const g = newGame("NVDA", 0, 9);
    const { state, reason } = placeOrder(g, { side: "sell", shares: 5 }, bars[1]!.o);
    expect(reason).toMatch(/only hold 0/);
    expect(state.pending).toBeNull();
  });

  it("rejects a buy that exceeds cash at the next open", () => {
    const g = newGame("NVDA", 0, 9);
    const { reason } = placeOrder(g, { side: "buy", shares: 100_000 }, bars[1]!.o);
    expect(reason).toMatch(/Not enough cash/);
  });

  it("rejects zero / negative / non-finite sizes", () => {
    const g = newGame("NVDA", 0, 9);
    for (const shares of [0, -5, Number.NaN]) {
      expect(placeOrder(g, { side: "buy", shares }, 100).reason).toMatch(/share count/);
    }
  });

  it("cancels a pending order", () => {
    const g = newGame("NVDA", 0, 9);
    const { state } = placeOrder(g, { side: "buy", shares: 10 }, bars[1]!.o);
    expect(cancelOrder(state).pending).toBeNull();
  });
});

describe("nextDay fills", () => {
  const bars = ramp(10);

  it("fills at the NEXT day's open, never the close the player already saw", () => {
    const g = newGame("NVDA", 0, 9);
    const { state } = placeOrder(g, { side: "buy", shares: 10 }, bars[1]!.o);
    const after = nextDay(state, bars);
    // bars[1].o === 101, not bars[0].c === 100.
    expect(after.fills).toEqual([{ d: bars[1]!.d, side: "buy", shares: 10, price: 101 }]);
    expect(after.cash).toBe(INITIAL_CASH - 1010);
    expect(after.shares).toBe(10);
    expect(after.avgCost).toBe(101);
    expect(after.pending).toBeNull();
  });

  it("averages cost across two buys and realizes P&L on the sell", () => {
    let g = newGame("NVDA", 0, 9);
    g = nextDay(placeOrder(g, { side: "buy", shares: 10 }, bars[1]!.o).state, bars); // 10 @ 101
    g = nextDay(placeOrder(g, { side: "buy", shares: 10 }, bars[2]!.o).state, bars); // 10 @ 102
    expect(g.shares).toBe(20);
    expect(g.avgCost).toBeCloseTo(101.5, 10);

    g = nextDay(placeOrder(g, { side: "sell", shares: 20 }, bars[3]!.o).state, bars); // 20 @ 103
    expect(g.shares).toBe(0);
    expect(g.avgCost).toBe(0); // basis resets when flat
    expect(g.realized).toBeCloseTo(20 * (103 - 101.5), 10);
  });

  it("trims a buy that gapped out of reach instead of dropping it", () => {
    const gapped: GameBar[] = [
      { d: "2021-01-01", o: 100, h: 100, l: 100, c: 100, v: 1 },
      { d: "2021-01-02", o: 100_000, h: 100_000, l: 100_000, c: 100_000, v: 1 },
    ];
    const g = { ...newGame("NVDA", 0, 1), cash: 150_000 };
    const after = nextDay(placeOrder(g, { side: "buy", shares: 2 }, 100).state, gapped);
    expect(after.shares).toBe(1); // 2 wanted, 1 affordable
    expect(after.cash).toBe(50_000);
  });

  it("settles at the hidden end index", () => {
    let g = newGame("NVDA", 0, 3);
    for (let i = 0; i < 3; i++) g = nextDay(g, bars);
    expect(g.cursor).toBe(3);
    expect(g.over).toBe(true);
    // A settled game ignores further days.
    expect(nextDay(g, bars)).toBe(g);
  });

  it("ends when the series runs out even if endIndex is beyond it", () => {
    let g = newGame("NVDA", 8, 50);
    g = nextDay(g, bars); // -> 9, the last bar
    g = nextDay(g, bars); // no bar 10
    expect(g.over).toBe(true);
  });
});

describe("KPIs", () => {
  it("marks the position at the current close and reports total + annualized return", () => {
    // 366 calendar days so the CAGR is ~ the total return.
    const bars: GameBar[] = [
      { d: "2021-01-01", o: 100, h: 100, l: 100, c: 100, v: 1 },
      { d: "2021-01-02", o: 100, h: 100, l: 100, c: 100, v: 1 },
      { d: "2022-01-02", o: 200, h: 200, l: 200, c: 200, v: 1 },
    ];
    let g = newGame("NVDA", 0, 2);
    g = nextDay(placeOrder(g, { side: "buy", shares: 1000 }, 100).state, bars); // 1000 @ 100
    g = nextDay(g, bars); // cursor -> 2, close 200

    const k = computeKpis(g, bars, 0);
    expect(k.positionValue).toBe(200_000);
    expect(k.equity).toBe(INITIAL_CASH - 100_000 + 200_000);
    expect(k.unrealized).toBe(100_000);
    expect(k.unrealizedPct).toBeCloseTo(100, 10);
    expect(k.totalReturnPct).toBeCloseTo(100, 10);
    expect(k.cagrPct).toBeGreaterThan(95);
    expect(k.cagrPct).toBeLessThan(101);
  });

  it("benchmarks buy-and-hold at the same next-open rule", () => {
    const bars: GameBar[] = [
      { d: "2021-01-01", o: 100, h: 100, l: 100, c: 100, v: 1 },
      { d: "2021-01-02", o: 100, h: 100, l: 100, c: 100, v: 1 },
      { d: "2022-01-02", o: 200, h: 200, l: 200, c: 200, v: 1 },
    ];
    // Player never trades; B&H bought 1000 @ 100 and is now worth 200k.
    const k = computeKpis({ ...newGame("NVDA", 0, 2), cursor: 2 }, bars, 0);
    expect(k.totalReturnPct).toBe(0);
    expect(k.buyHoldEquity).toBe(200_000);
    expect(k.buyHoldReturnPct).toBeCloseTo(100, 10);
  });

  it("reports no unrealized P&L when flat", () => {
    const bars = ramp(5);
    const k = computeKpis({ ...newGame("NVDA", 0, 4), cursor: 4 }, bars, 0);
    expect(k.unrealized).toBe(0);
    expect(k.unrealizedPct).toBeNull();
  });
});

describe("helpers", () => {
  it("maxBuyable floors to whole shares and guards bad prices", () => {
    expect(maxBuyable(1000, 300)).toBe(3);
    expect(maxBuyable(1000, 0)).toBe(0);
    expect(maxBuyable(1000, Number.NaN)).toBe(0);
  });

  it("cagr refuses windows too short to annualize, and total wipeouts", () => {
    expect(cagr(1.5, 10)).toBeNull();
    expect(cagr(0, 365)).toBeNull();
    expect(cagr(2, 365)).toBeCloseTo(100, 6);
  });
});

describe("PIT fundamentals", () => {
  const funds = [
    { knownAt: "2021-02-24", ttmEps: 1.0, ttmRevenue: 1000, sharesOut: 100, bookValuePerShare: 5 },
    { knownAt: "2021-05-26", ttmEps: 2.0, ttmRevenue: 2000, sharesOut: 100, bookValuePerShare: 6 },
    { knownAt: "2021-08-18", ttmEps: 3.0, ttmRevenue: 3000, sharesOut: 100, bookValuePerShare: 7 },
  ];

  it("returns the newest filing already public on the date, never a later one", () => {
    expect(pickFundamental(funds, "2021-05-25")?.ttmEps).toBe(1.0); // day before the Q lands
    expect(pickFundamental(funds, "2021-05-26")?.ttmEps).toBe(2.0); // the day it lands
    expect(pickFundamental(funds, "2021-08-01")?.ttmEps).toBe(2.0); // still the prior Q
  });

  it("returns null before any filing exists", () => {
    expect(pickFundamental(funds, "2020-01-01")).toBeNull();
    expect(pickFundamental([], "2021-05-26")).toBeNull();
  });
});

describe("computeQuote", () => {
  const bars: GameBar[] = [
    { d: "2021-01-04", o: 90, h: 95, l: 88, c: 92, v: 1_000 },
    { d: "2021-01-05", o: 92, h: 110, l: 91, c: 100, v: 2_000 },
  ];
  const funds = [{ knownAt: "2021-01-01", ttmEps: 4, ttmRevenue: 500, sharesOut: 1_000, bookValuePerShare: 25 }];

  it("derives session stats from the current bar and the one before it", () => {
    const q = computeQuote(bars, 1, funds)!;
    expect(q.close).toBe(100);
    expect(q.prevClose).toBe(92);
    expect(q.changeAbs).toBe(8);
    expect(q.changePct).toBeCloseTo(8.6957, 3);
    expect(q.rangePct).toBeCloseTo((19 / 92) * 100, 6);
    expect(q.week52High).toBe(110);
    expect(q.week52Low).toBe(88);
  });

  it("computes PIT multiples off the filing that was public", () => {
    const q = computeQuote(bars, 1, funds)!;
    expect(q.marketCap).toBe(100_000);
    expect(q.peTtm).toBe(25); // 100 / 4
    expect(q.priceToBook).toBe(4); // 100 / 25
    expect(q.psTtm).toBe(200); // 100_000 / 500
    expect(q.isLoss).toBe(false);
  });

  it("flags a loss instead of printing a negative P/E", () => {
    const q = computeQuote(bars, 1, [{ ...funds[0]!, ttmEps: -2 }])!;
    expect(q.peTtm).toBeNull();
    expect(q.isLoss).toBe(true);
  });

  it("degrades to nulls when no filing is public yet", () => {
    const q = computeQuote(bars, 1, [])!;
    expect(q.marketCap).toBeNull();
    expect(q.peTtm).toBeNull();
    expect(q.isLoss).toBe(false);
    expect(q.close).toBe(100); // price stats still work
  });

  it("has no prev-close stats on the very first bar", () => {
    const q = computeQuote(bars, 0, funds)!;
    expect(q.prevClose).toBeNull();
    expect(q.changePct).toBeNull();
    expect(q.rangePct).toBeNull();
  });
});
