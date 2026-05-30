import { describe, it, expect } from "vitest";
import { mapInsider, type FmpInsider } from "./insider.js";

const W = { from: "2026-05-01", to: "2026-05-31" };
const t = (o: Partial<FmpInsider>): FmpInsider => ({ filingDate: "2026-05-15", transactionDate: "2026-05-14", ...o });
const grp = (symbol: string, rows: FmpInsider[]) => [{ symbol, rows }];

describe("mapInsider", () => {
  it("keeps open-market Purchase (bullish) and Sale (bearish)", () => {
    const out = mapInsider(
      [
        { symbol: "AAPL", rows: [t({ transactionType: "P-Purchase", securitiesTransacted: 100 })] },
        { symbol: "MSFT", rows: [t({ transactionType: "S-Sale", securitiesTransacted: 50 })] },
      ],
      W,
    );
    const dir = Object.fromEntries(out.map((e) => [e.symbol, e.direction_hint]));
    expect(dir).toEqual({ AAPL: "bullish", MSFT: "bearish" });
  });

  it("drops non-market transactions (gift / award / option exercise)", () => {
    const out = mapInsider(
      grp("AAPL", [
        t({ transactionType: "G-Gift" }),
        t({ transactionType: "A-Award" }),
        t({ transactionType: "M-Exempt" }),
      ]),
      W,
    );
    expect(out).toEqual([]);
  });

  it("drops out-of-window rows (by filingDate)", () => {
    const out = mapInsider(grp("AAPL", [t({ transactionType: "P-Purchase", filingDate: "2026-04-01" })]), W);
    expect(out).toEqual([]);
  });

  it("keeps only the latest insider trade per symbol", () => {
    const out = mapInsider(
      grp("AAPL", [
        t({ transactionType: "P-Purchase", filingDate: "2026-05-05", securitiesTransacted: 1 }),
        t({ transactionType: "S-Sale", filingDate: "2026-05-25", securitiesTransacted: 2 }),
      ]),
      W,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.observed_at).toBe("2026-05-25");
    expect(out[0]!.direction_hint).toBe("bearish");
  });
});
