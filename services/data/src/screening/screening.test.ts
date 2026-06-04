import { describe, it, expect } from "vitest";
import { runScreen, type ScreenContext, type NewsRow } from "./index.js";
import { MIN_MARKET_CAP } from "./rules/min-market-cap.js";

const ctx = (over: Partial<ScreenContext>): ScreenContext => ({
  news: {} as NewsRow,
  symbol: "AAPL",
  profile: { marketCap: MIN_MARKET_CAP },
  ...over,
});

describe("runScreen", () => {
  it("rejects a symbol-less row with the cheapest rule first", () => {
    const r = runScreen(ctx({ symbol: null, profile: null }));
    expect(r).toMatchObject({ passed: false, failedRule: "require_symbol", reason: "no_symbol" });
  });

  it("rejects when market cap is below the floor, with detail", () => {
    const r = runScreen(ctx({ profile: { marketCap: 5e8 } }));
    expect(r.passed).toBe(false);
    expect(r.failedRule).toBe("min_market_cap");
    expect(r.reason).toBe("market_cap_below_min");
    expect(r.detail).toMatchObject({ marketCap: 5e8, min: MIN_MARKET_CAP });
  });

  it("rejects when market cap is unknown (missing/non-numeric)", () => {
    expect(runScreen(ctx({ profile: {} })).reason).toBe("market_cap_unknown");
    expect(runScreen(ctx({ profile: null })).reason).toBe("market_cap_unknown");
  });

  it("passes a large-cap symbol", () => {
    expect(runScreen(ctx({ profile: { marketCap: 3e12 } }))).toEqual({ passed: true });
  });

  it("short-circuits: no_symbol takes precedence over market cap", () => {
    // symbol null AND no profile → require_symbol fires before min_market_cap.
    expect(runScreen(ctx({ symbol: null, profile: { marketCap: 5e8 } })).failedRule).toBe("require_symbol");
  });
});
