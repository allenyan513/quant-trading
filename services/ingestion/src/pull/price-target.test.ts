import { describe, it, expect } from "vitest";
import { mapPriceTargets, type FmpPriceTarget } from "./price-target.js";

const W = { from: "2026-05-01", to: "2026-05-31" };
const p = (o: Partial<FmpPriceTarget>): FmpPriceTarget => ({
  publishedDate: "2026-05-15T10:00:00.000Z",
  priceTarget: 200,
  priceWhenPosted: 150,
  analystCompany: "X",
  ...o,
});
const grp = (symbol: string, rows: FmpPriceTarget[]) => [{ symbol, rows }];

describe("mapPriceTargets", () => {
  it("direction = bullish when target > price, bearish when target < price, null when equal", () => {
    const out = mapPriceTargets(
      [
        { symbol: "AAPL", rows: [p({ priceTarget: 200, priceWhenPosted: 150 })] },
        { symbol: "MSFT", rows: [p({ priceTarget: 100, priceWhenPosted: 150 })] },
        { symbol: "NVDA", rows: [p({ priceTarget: 150, priceWhenPosted: 150 })] },
      ],
      W,
    );
    const dir = Object.fromEntries(out.map((e) => [e.symbol, e.direction_hint]));
    expect(dir).toEqual({ AAPL: "bullish", MSFT: "bearish", NVDA: null });
  });

  it("skips rows without a price target", () => {
    const out = mapPriceTargets(grp("AAPL", [p({ priceTarget: undefined })]), W);
    expect(out).toEqual([]);
  });

  it("drops out-of-window rows", () => {
    const out = mapPriceTargets(grp("AAPL", [p({ publishedDate: "2026-04-01T10:00:00.000Z" })]), W);
    expect(out).toEqual([]);
  });

  it("keeps observed_at as the ISO-Z timestamp and the latest per symbol", () => {
    const out = mapPriceTargets(
      grp("AAPL", [
        p({ publishedDate: "2026-05-05T10:00:00.000Z", priceTarget: 180 }),
        p({ publishedDate: "2026-05-20T10:00:00.000Z", priceTarget: 220 }),
      ]),
      W,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.observed_at).toBe("2026-05-20T10:00:00.000Z");
  });
});
