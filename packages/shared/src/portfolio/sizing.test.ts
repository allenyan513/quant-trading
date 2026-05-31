import { describe, it, expect } from "vitest";
import { sizePosition, type SizingParams, type SizingInput } from "./sizing.js";

const P: SizingParams = {
  capital: 100_000,
  sizeByConviction: { low: 0.01, medium: 0.02, high: 0.03 },
  maxPositions: 20,
  maxWeightPerName: 0.05,
  maxSectorWeight: 0.3,
};

function input(over: Partial<SizingInput> & { signal: SizingInput["signal"] }): SizingInput {
  return { sector: "Tech", book: [], params: P, ...over };
}

const buy = (extra: Partial<SizingInput["signal"]> = {}) => ({
  symbol: "NVDA",
  direction: "buy" as const,
  conviction: "high" as const,
  entryPrice: 100,
  ...extra,
});

describe("sizePosition", () => {
  it("opens a high-conviction buy on an empty book", () => {
    const d = sizePosition(input({ signal: buy() }));
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetWeight).toBeCloseTo(0.03);
    expect(d.targetNotional).toBeCloseTo(3000);
    expect(d.shares).toBeCloseTo(30); // 3000 / 100
    expect(d.reasons).toEqual([]);
  });

  it("treats null conviction as the most conservative (low) tier", () => {
    const d = sizePosition(input({ signal: buy({ conviction: null }) }));
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetWeight).toBeCloseTo(0.01);
  });

  it("rejects non-buy directions (long-only v1)", () => {
    for (const direction of ["sell", "hold"] as const) {
      const d = sizePosition(input({ signal: buy({ direction }) }));
      expect(d).toEqual({ action: "reject", reasons: ["non_buy_direction"] });
    }
  });

  it("rejects missing or non-positive entry price", () => {
    expect(sizePosition(input({ signal: buy({ entryPrice: null }) })).reasons).toEqual([
      "missing_entry_price",
    ]);
    expect(sizePosition(input({ signal: buy({ entryPrice: 0 }) })).reasons).toEqual([
      "missing_entry_price",
    ]);
  });

  it("rejects a symbol already held (no add-to-position in v1)", () => {
    const d = sizePosition(
      input({ signal: buy(), book: [{ symbol: "NVDA", sector: "Tech", targetNotional: 3000 }] }),
    );
    expect(d).toEqual({ action: "reject", reasons: ["already_holding"] });
  });

  it("rejects when the book is already at max positions", () => {
    const book = Array.from({ length: 20 }, (_, i) => ({
      symbol: `S${i}`,
      sector: "Other",
      targetNotional: 100,
    }));
    const d = sizePosition(input({ signal: buy(), book }));
    expect(d).toEqual({ action: "reject", reasons: ["max_positions_reached"] });
  });

  it("trims to the per-name cap", () => {
    const params = { ...P, maxWeightPerName: 0.02 };
    const d = sizePosition(input({ signal: buy(), params })); // high = 0.03 > 0.02
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetWeight).toBeCloseTo(0.02);
    expect(d.reasons).toContain("capped_per_name");
  });

  it("trims to the sector headroom", () => {
    // Same sector already at 0.29 of capital -> headroom 0.01 < high 0.03.
    const book = [{ symbol: "AMD", sector: "Tech", targetNotional: 29_000 }];
    const d = sizePosition(input({ signal: buy(), book }));
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetWeight).toBeCloseTo(0.01);
    expect(d.reasons).toContain("capped_by_sector");
  });

  it("rejects when the sector is already at its cap", () => {
    const book = [{ symbol: "AMD", sector: "Tech", targetNotional: 30_000 }];
    const d = sizePosition(input({ signal: buy(), book }));
    expect(d).toEqual({ action: "reject", reasons: ["sector_cap_reached"] });
  });

  it("ignores the sector cap when the incoming sector is unknown", () => {
    const book = [{ symbol: "AMD", sector: "Tech", targetNotional: 30_000 }];
    const d = sizePosition(input({ signal: buy(), sector: null, book }));
    expect(d.action).toBe("open"); // not constrained by Tech's full sector
  });

  it("trims to available cash", () => {
    // Cash = 1000; different sector so only the cash cap bites.
    const book = [{ symbol: "XOM", sector: "Energy", targetNotional: 99_000 }];
    const d = sizePosition(input({ signal: buy(), book }));
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetNotional).toBeCloseTo(1000);
    expect(d.targetWeight).toBeCloseTo(0.01);
    expect(d.shares).toBeCloseTo(10); // 1000 / 100
    expect(d.reasons).toContain("capped_by_cash");
  });

  it("rejects when there is no cash left", () => {
    const book = [{ symbol: "XOM", sector: "Energy", targetNotional: 100_000 }];
    const d = sizePosition(input({ signal: buy(), book }));
    expect(d).toEqual({ action: "reject", reasons: ["no_cash"] });
  });

  it("stacks caps and reports all reasons (per-name + cash)", () => {
    // per-name cap 0.02 -> 2000 wanted; cash only 1500 -> trimmed to 1500.
    const params = { ...P, maxWeightPerName: 0.02 };
    const book = [{ symbol: "XOM", sector: "Energy", targetNotional: 98_500 }];
    const d = sizePosition(input({ signal: buy(), book, params }));
    expect(d.action).toBe("open");
    if (d.action !== "open") return;
    expect(d.targetNotional).toBeCloseTo(1500);
    expect(d.reasons).toEqual(expect.arrayContaining(["capped_per_name", "capped_by_cash"]));
  });
});
