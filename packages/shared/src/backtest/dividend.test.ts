import { describe, it, expect } from "vitest";
import {
  runDividendBacktest,
  findDividendCuts,
  cagr,
  maxDrawdown,
  annualizedVol,
  BacktestError,
  type BacktestBar,
  type BacktestDividend,
} from "./dividend.js";

/** Daily bars at a flat price across a date range (weekends included — the engine
 *  only cares that dates are ordered, not that they are real trading days). */
function flatBars(from: string, to: string, close: number): BacktestBar[] {
  const out: BacktestBar[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push({ date: new Date(t).toISOString().slice(0, 10), close });
  }
  return out;
}

describe("metric helpers", () => {
  it("cagr compounds over multi-year windows and stays simple under a year", () => {
    expect(cagr(100, 121, 730.5)).toBeCloseTo(0.1, 6); // 2y, 10%/y
    expect(cagr(100, 110, 180)).toBeCloseTo(0.1, 6); // under a year → simple return
    expect(cagr(0, 100, 365)).toBe(0);
  });

  it("maxDrawdown measures the deepest peak-to-trough decline", () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(0.5, 6);
    expect(maxDrawdown([100, 101, 102])).toBe(0);
  });

  it("annualizedVol is zero for a flat series", () => {
    expect(annualizedVol([100, 100, 100, 100])).toBe(0);
  });
});

describe("runDividendBacktest", () => {
  it("hand-checked single holding: flat price, one dividend, DRIP vs cash", () => {
    // $1,000 at $10 = 100 shares. One $1/share dividend → $100 income.
    // DRIP: 100 / $10 = 10 more shares → 110 shares × $10 = $1,100.
    // No DRIP: 100 shares × $10 + $100 idle cash = $1,100 too (flat price), but the
    // cash sits outside the position.
    const r = runDividendBacktest({
      holdings: [
        {
          symbol: "TEST",
          weight: 100,
          bars: flatBars("2020-01-01", "2020-12-31", 10),
          dividends: [{ exDate: "2020-06-01", amount: 1 }],
        },
      ],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-12-31",
      reinvest: true,
    });

    expect(r.start).toBe("2020-01-01");
    expect(r.end).toBe("2020-12-31");
    expect(r.drip.endValue).toBeCloseTo(1100, 6);
    expect(r.drip.totalIncome).toBeCloseTo(100, 6);
    expect(r.noDrip.endValue).toBeCloseTo(1100, 6);
    expect(r.noDrip.endCash).toBeCloseTo(100, 6);
    expect(r.holdings[0]!.endShares).toBeCloseTo(110, 6);
    expect(r.yieldOnCostPct).toBeCloseTo(10, 6);
  });

  it("reinvested shares earn the next dividend — DRIP pulls ahead of idle cash", () => {
    const bars = flatBars("2020-01-01", "2020-12-31", 10);
    const dividends: BacktestDividend[] = [
      { exDate: "2020-03-02", amount: 1 },
      { exDate: "2020-09-01", amount: 1 },
    ];
    const r = runDividendBacktest({
      holdings: [{ symbol: "TEST", weight: 1, bars, dividends }],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-12-31",
      reinvest: true,
    });

    // First: 100 sh × $1 = $100 → +10 sh (110). Second: 110 sh × $1 = $110 → +11 sh (121).
    expect(r.drip.totalIncome).toBeCloseTo(210, 6);
    expect(r.holdings[0]!.endShares).toBeCloseTo(121, 6);
    expect(r.drip.endValue).toBeCloseTo(1210, 6);
    // Without reinvestment the share count never grows: $100 + $100 of cash.
    expect(r.noDrip.totalIncome).toBeCloseTo(200, 6);
    expect(r.noDrip.endValue).toBeCloseTo(1200, 6);
    expect(r.drip.endValue).toBeGreaterThan(r.noDrip.endValue);
  });

  it("prices are split-adjusted, so a doubling price doubles the position", () => {
    const bars = [...flatBars("2020-01-01", "2020-06-30", 10), ...flatBars("2020-07-01", "2020-12-31", 20)];
    const r = runDividendBacktest({
      holdings: [{ symbol: "TEST", weight: 1, bars, dividends: [] }],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-12-31",
      reinvest: true,
    });
    expect(r.drip.endValue).toBeCloseTo(2000, 6);
    expect(r.drip.totalReturnPct).toBeCloseTo(100, 6);
    expect(r.drip.maxDrawdownPct).toBe(0);
  });

  it("weights are normalized and split the opening trade", () => {
    const r = runDividendBacktest({
      holdings: [
        { symbol: "A", weight: 3, bars: flatBars("2020-01-01", "2020-12-31", 10), dividends: [] },
        { symbol: "B", weight: 1, bars: flatBars("2020-01-01", "2020-12-31", 50), dividends: [] },
      ],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-12-31",
      reinvest: true,
    });
    expect(r.holdings[0]!.weightPct).toBeCloseTo(75, 6);
    expect(r.holdings[0]!.startValue).toBeCloseTo(750, 6);
    expect(r.holdings[1]!.startValue).toBeCloseTo(250, 6);
    expect(r.holdings[1]!.endShares).toBeCloseTo(5, 6);
  });

  it("clamps the window to the intersection of available history and warns", () => {
    const r = runDividendBacktest({
      holdings: [
        { symbol: "OLD", weight: 1, bars: flatBars("2018-01-01", "2020-12-31", 10), dividends: [] },
        { symbol: "NEW", weight: 1, bars: flatBars("2019-06-01", "2020-12-31", 10), dividends: [] },
      ],
      initial: 1000,
      from: "2018-01-01",
      to: "2020-12-31",
      reinvest: true,
    });
    expect(r.start).toBe("2019-06-01");
    // The older holding covers the whole window, so it contributes no warning.
    expect(r.warnings.some((w) => w.startsWith("OLD"))).toBe(false);
    expect(r.warnings.some((w) => w.includes("NEW price history only starts 2019-06-01"))).toBe(true);
  });

  it("settles a dividend whose ex-date is not a trading day on the next bar", () => {
    // Bars only on the 1st and 15th; an ex-date of the 3rd settles on the 15th.
    const bars: BacktestBar[] = [
      { date: "2020-01-01", close: 10 },
      { date: "2020-01-15", close: 10 },
      { date: "2020-02-01", close: 10 },
    ];
    const r = runDividendBacktest({
      holdings: [{ symbol: "TEST", weight: 1, bars, dividends: [{ exDate: "2020-01-03", amount: 1 }] }],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-02-01",
      reinvest: true,
    });
    expect(r.drip.totalIncome).toBeCloseTo(100, 6);
    expect(r.holdings[0]!.endShares).toBeCloseTo(110, 6);
  });

  it("ignores a dividend that went ex on the entry day (the buyer misses it)", () => {
    const r = runDividendBacktest({
      holdings: [
        {
          symbol: "TEST",
          weight: 1,
          bars: flatBars("2020-01-01", "2020-03-01", 10),
          dividends: [{ exDate: "2020-01-01", amount: 1 }],
        },
      ],
      initial: 1000,
      from: "2020-01-01",
      to: "2020-03-01",
      reinvest: true,
    });
    expect(r.drip.totalIncome).toBe(0);
  });

  it("reports income by calendar year and flags partial years", () => {
    const r = runDividendBacktest({
      holdings: [
        {
          symbol: "TEST",
          weight: 1,
          bars: flatBars("2020-06-01", "2022-06-01", 10),
          dividends: [
            { exDate: "2020-09-01", amount: 1 },
            { exDate: "2021-09-01", amount: 1 },
            { exDate: "2022-03-01", amount: 1 },
          ],
        },
      ],
      initial: 1000,
      from: "2020-06-01",
      to: "2022-06-01",
      reinvest: false,
    });
    const years = r.incomeByYear.map((y) => [y.year, Math.round(y.income), y.partial] as const);
    expect(years).toEqual([
      [2020, 100, true],
      [2021, 100, false],
      [2022, 100, true],
    ]);
    // 2021 neighbours a partial year on both sides → no growth figure, and with a
    // single full year there is no income CAGR to report.
    expect(r.incomeByYear[1]!.growthPct).toBeNull();
    expect(r.incomeCagrPct).toBeNull();
  });

  it("computes income growth and income CAGR across full years", () => {
    const dividends = [
      { exDate: "2020-06-01", amount: 1 },
      { exDate: "2021-06-01", amount: 1.1 },
      { exDate: "2022-06-01", amount: 1.21 },
    ];
    const r = runDividendBacktest({
      holdings: [{ symbol: "TEST", weight: 1, bars: flatBars("2019-12-31", "2022-12-31", 10), dividends }],
      initial: 1000,
      from: "2019-12-31",
      to: "2022-12-31",
      reinvest: false,
    });
    const full = r.incomeByYear.filter((y) => !y.partial);
    expect(full.map((y) => y.year)).toEqual([2020, 2021, 2022]);
    expect(full[1]!.growthPct).toBeCloseTo(10, 6);
    expect(r.incomeCagrPct).toBeCloseTo(10, 6);
  });

  it("rejects unusable inputs", () => {
    const bars = flatBars("2020-01-01", "2020-12-31", 10);
    expect(() =>
      runDividendBacktest({ holdings: [], initial: 1000, from: "2020-01-01", to: "2020-12-31", reinvest: true }),
    ).toThrow(BacktestError);
    expect(() =>
      runDividendBacktest({
        holdings: [{ symbol: "A", weight: 0, bars, dividends: [] }],
        initial: 1000,
        from: "2020-01-01",
        to: "2020-12-31",
        reinvest: true,
      }),
    ).toThrow(/weights/);
    expect(() =>
      runDividendBacktest({
        holdings: [{ symbol: "A", weight: 1, bars, dividends: [] }],
        initial: 1000,
        from: "2021-01-01",
        to: "2021-12-31",
        reinvest: true,
      }),
    ).toThrow(/no price history/);
  });
});

describe("findDividendCuts", () => {
  it("flags a year that paid less per share than the previous full year", () => {
    const cuts = findDividendCuts(
      [
        {
          symbol: "CUTTER",
          dividends: [
            { exDate: "2020-06-01", amount: 2 },
            { exDate: "2021-06-01", amount: 1 },
            { exDate: "2022-06-01", amount: 1.5 },
          ],
        },
      ],
      "2020-01-01",
      "2022-12-31",
    );
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ symbol: "CUTTER", year: 2021, perShare: 1, priorPerShare: 2 });
    expect(cuts[0]!.changePct).toBeCloseTo(-50, 6); // the change in the annual total
  });

  it("ignores a monthly payer's 13-ex-date year (a calendar artifact, not a cut)", () => {
    // 13 payments of 0.235 in 2023, then 12 of 0.239 in 2024: the annual SUM falls
    // 6% while the actual monthly rate rose — the Realty Income 2024 false positive.
    const dividends = [
      ...Array.from({ length: 13 }, (_, i) => ({ exDate: `2023-${String(Math.min(12, i + 1)).padStart(2, "0")}-${i === 12 ? "29" : "01"}`, amount: 0.235 })),
      ...Array.from({ length: 12 }, (_, i) => ({ exDate: `2024-${String(i + 1).padStart(2, "0")}-01`, amount: 0.239 })),
    ];
    expect(findDividendCuts([{ symbol: "MONTHLY", dividends }], "2023-01-01", "2024-12-31")).toEqual([]);
  });

  it("ignores a BDC's extra supplemental payouts (more, smaller cheques)", () => {
    // 12 × 0.215 in 2021, then 12 monthly + 2 supplementals in 2022: the total rose
    // 14% while the average payment fell 7% — the Main Street 2022 false positive.
    const dividends = [
      ...Array.from({ length: 12 }, (_, i) => ({ exDate: `2021-${String(i + 1).padStart(2, "0")}-01`, amount: 0.215 })),
      ...Array.from({ length: 12 }, (_, i) => ({ exDate: `2022-${String(i + 1).padStart(2, "0")}-01`, amount: 0.215 })),
      { exDate: "2022-03-15", amount: 0.1 },
      { exDate: "2022-09-15", amount: 0.2 },
    ];
    expect(findDividendCuts([{ symbol: "BDC", dividends }], "2021-01-01", "2022-12-31")).toEqual([]);
  });

  it("ignores a broad-market ETF's couple-of-percent wobble", () => {
    // QQQ's real shape: 2020 paid 1.737/share, 2021 paid 1.697 — a 2.3% dip with
    // no company having cut anything. Reported on a growth page as a dividend cut,
    // that is a false signal in the worst possible place.
    const dividends = [
      ...["03", "06", "09", "12"].map((m) => ({ exDate: `2020-${m}-20`, amount: 1.737 / 4 })),
      ...["03", "06", "09", "12"].map((m) => ({ exDate: `2021-${m}-20`, amount: 1.697 / 4 })),
    ];
    expect(findDividendCuts([{ symbol: "QQQ", dividends }], "2020-01-01", "2021-12-31")).toEqual([]);
  });

  it("still flags a real cut just past the threshold", () => {
    // JEPI 2024 fell 8.7% — comfortably above the 5% floor, and genuinely less cash.
    const dividends = [
      ...["03", "06", "09", "12"].map((m) => ({ exDate: `2020-${m}-20`, amount: 1.0 })),
      ...["03", "06", "09", "12"].map((m) => ({ exDate: `2021-${m}-20`, amount: 0.913 })),
    ];
    const cuts = findDividendCuts([{ symbol: "REAL", dividends }], "2020-01-01", "2021-12-31");
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.changePct).toBeCloseTo(-8.7, 1);
  });

  it("flags a suspension — a full year with no payment at all", () => {
    const cuts = findDividendCuts(
      [{ symbol: "STOPPED", dividends: [{ exDate: "2020-06-01", amount: 1 }] }],
      "2020-01-01",
      "2021-12-31",
    );
    expect(cuts).toMatchObject([{ symbol: "STOPPED", year: 2021, perShare: 0, changePct: -100 }]);
  });

  it("ignores partial first/last years, which only look like cuts", () => {
    // The window opens mid-2020, so 2020 shows one payment vs four in 2021 — not a cut.
    const dividends = [
      { exDate: "2020-10-01", amount: 1 },
      ...["03", "06", "09", "12"].map((m) => ({ exDate: `2021-${m}-01`, amount: 1 })),
      ...["03", "06"].map((m) => ({ exDate: `2022-${m}-01`, amount: 1 })),
    ];
    expect(findDividendCuts([{ symbol: "OK", dividends }], "2020-07-01", "2022-06-30")).toEqual([]);
  });
});
