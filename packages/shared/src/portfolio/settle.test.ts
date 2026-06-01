import { describe, it, expect } from "vitest";
import { settleDecision } from "./settle.js";

const base = {
  direction: "buy",
  entryPrice: 100,
  price: 105,
  targetPrice: null,
  stopLoss: null,
  expiresAtMs: null,
  nowMs: 1_000,
};

describe("settleDecision", () => {
  it("keeps a position open when nothing is hit", () => {
    expect(settleDecision(base)).toEqual({ close: false });
  });

  it("closes a buy at target_hit with realized return", () => {
    const d = settleDecision({ ...base, price: 120, targetPrice: 110 });
    expect(d).toMatchObject({ close: true, status: "target_hit" });
    if (d.close) expect(d.realizedReturn).toBeCloseTo(0.2, 10);
  });

  it("closes a buy at stopped_out", () => {
    const d = settleDecision({ ...base, price: 90, stopLoss: 95 });
    expect(d).toMatchObject({ close: true, status: "stopped_out" });
    if (d.close) expect(d.realizedReturn).toBeCloseTo(-0.1, 10);
  });

  it("expires only once now passes the expiry", () => {
    expect(settleDecision({ ...base, expiresAtMs: 2_000, nowMs: 1_500 })).toEqual({ close: false });
    const d = settleDecision({ ...base, expiresAtMs: 2_000, nowMs: 2_500 });
    expect(d).toMatchObject({ close: true, status: "expired" });
    if (d.close) expect(d.realizedReturn).toBeCloseTo(0.05, 10);
  });

  it("prefers a target/stop hit over expiry", () => {
    const d = settleDecision({ ...base, price: 120, targetPrice: 110, expiresAtMs: 0, nowMs: 9_999 });
    expect(d).toMatchObject({ close: true, status: "target_hit" });
  });

  it("stays open without a usable price or entry", () => {
    expect(settleDecision({ ...base, price: null, targetPrice: 1 })).toEqual({ close: false });
    expect(settleDecision({ ...base, price: 0, targetPrice: 1 })).toEqual({ close: false });
    expect(settleDecision({ ...base, entryPrice: null, price: 120, targetPrice: 1 })).toEqual({ close: false });
  });

  it("computes the sell-side realized return symmetrically", () => {
    const d = settleDecision({ ...base, direction: "sell", price: 80, targetPrice: 90 });
    expect(d).toMatchObject({ close: true, status: "target_hit" });
    if (d.close) expect(d.realizedReturn).toBeCloseTo(0.25, 10);
  });
});
