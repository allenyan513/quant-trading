import { describe, it, expect } from "vitest";
import { mapMna, type FmpMna } from "./mna.js";

const base = { from: "2026-05-01", to: "2026-05-31" };
const m = (o: Partial<FmpMna>): FmpMna => ({ acceptedDate: "2026-05-15", transactionDate: "2026-05-15", ...o });

describe("mapMna", () => {
  it("watchlist target → bullish event on the target symbol", () => {
    const out = mapMna([m({ symbol: "BIGCO", targetedSymbol: "TGT" })], { ...base, symbols: ["TGT"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.symbol).toBe("TGT");
    expect(out[0]!.direction_hint).toBe("bullish");
  });

  it("watchlist acquirer → neutral event on the acquirer symbol", () => {
    const out = mapMna([m({ symbol: "ACQ", targetedSymbol: "SMALL" })], { ...base, symbols: ["ACQ"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.symbol).toBe("ACQ");
    expect(out[0]!.direction_hint).toBeNull();
  });

  it("emits one event per watchlist side when both are watched", () => {
    const out = mapMna([m({ symbol: "ACQ", targetedSymbol: "TGT" })], { ...base, symbols: ["ACQ", "TGT"] });
    expect(out.map((e) => e.symbol).sort()).toEqual(["ACQ", "TGT"]);
  });

  it("drops deals touching no watchlist symbol", () => {
    const out = mapMna([m({ symbol: "X", targetedSymbol: "Y" })], { ...base, symbols: ["AAPL"] });
    expect(out).toEqual([]);
  });

  it("drops out-of-window deals", () => {
    const out = mapMna([m({ targetedSymbol: "TGT", acceptedDate: "2026-01-01" })], { ...base, symbols: ["TGT"] });
    expect(out).toEqual([]);
  });
});
