import { describe, it, expect } from "vitest";
import { reviewHolding } from "./redecision.js";

describe("reviewHolding", () => {
  it("closes a long on a bearish (sell) view", () => {
    expect(reviewHolding({ direction: "sell" })).toBe("close");
  });

  it("holds on a still-bullish (buy) view — no add in v1", () => {
    expect(reviewHolding({ direction: "buy" })).toBe("hold");
  });

  it("holds on a neutral (hold) view", () => {
    expect(reviewHolding({ direction: "hold" })).toBe("hold");
  });
});
