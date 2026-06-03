import { describe, it, expect } from "vitest";
import { mapEarnings, type FmpEarning } from "./earnings.js";

const e = (o: Partial<FmpEarning>): FmpEarning => ({
  symbol: "AAPL",
  date: "2026-04-30",
  epsActual: 2.01,
  epsEstimated: 1.95,
  ...o,
});

describe("mapEarnings", () => {
  it("drops unreported rows (epsActual null = a scheduled, not-yet-reported date)", () => {
    const out = mapEarnings([e({ epsActual: null })], {});
    expect(out).toEqual([]);
  });

  it("derives direction_hint from EPS beat/miss", () => {
    const out = mapEarnings(
      [
        e({ symbol: "AAPL", epsActual: 2.01, epsEstimated: 1.95 }),
        e({ symbol: "MSFT", epsActual: 1.0, epsEstimated: 1.2 }),
        e({ symbol: "NVDA", epsActual: 1.0, epsEstimated: 1.0 }),
      ],
      {},
    );
    const dir = Object.fromEntries(out.map((x) => [x.symbol, x.direction_hint]));
    expect(dir).toEqual({ AAPL: "bullish", MSFT: "bearish", NVDA: null });
  });

  it("PIT: observed_at is the report date, never lastUpdated/now", () => {
    const [ev] = mapEarnings([e({ date: "2026-04-30", lastUpdated: "2026-06-03" })], {});
    expect(ev!.observed_at).toBe("2026-04-30");
    // lastUpdated post-dates the event and must NOT leak into the PIT stamp.
    expect(ev!.observed_at).not.toBe("2026-06-03");
  });

  it("filters to the requested symbols (case-insensitive)", () => {
    const out = mapEarnings([e({ symbol: "AAPL" }), e({ symbol: "MSFT" })], { symbols: ["aapl"] });
    expect(out.map((x) => x.symbol)).toEqual(["AAPL"]);
  });

  it("upcases the symbol and builds a stable external_id", () => {
    const [ev] = mapEarnings([e({ symbol: "aapl", date: "2026-04-30" })], {});
    expect(ev!.symbol).toBe("AAPL");
    expect(ev!.external_id).toBe("earnings:aapl:2026-04-30");
  });
});
