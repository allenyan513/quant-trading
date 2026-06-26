import { describe, it, expect } from "vitest";
import { limitCrosses, isDayExpired, fillMath } from "./paper.js";

describe("limitCrosses", () => {
  it("a buy limit fills at or below the limit", () => {
    expect(limitCrosses("buy", 349, 350)).toBe(true); // below → fills
    expect(limitCrosses("buy", 350, 350)).toBe(true); // at → fills
    expect(limitCrosses("buy", 351, 350)).toBe(false); // above → rests
  });
  it("a sell limit fills at or above the limit", () => {
    expect(limitCrosses("sell", 401, 400)).toBe(true); // above → fills
    expect(limitCrosses("sell", 400, 400)).toBe(true); // at → fills
    expect(limitCrosses("sell", 399, 400)).toBe(false); // below → rests
  });
});

describe("isDayExpired", () => {
  // 2026-06-25 13:00 ET == 2026-06-25T17:00:00Z (EDT, UTC-4).
  const placed = new Date("2026-06-25T17:00:00Z");
  it("a day order placed on an earlier ET day is expired", () => {
    expect(isDayExpired("day", placed, new Date("2026-06-26T17:00:00Z"))).toBe(true);
  });
  it("a day order placed today is not expired", () => {
    expect(isDayExpired("day", placed, new Date("2026-06-25T19:30:00Z"))).toBe(false);
  });
  it("crossing the UTC midnight but same ET day is not expired", () => {
    // 2026-06-26T02:00:00Z is still 2026-06-25 22:00 ET → same ET day as placed.
    expect(isDayExpired("day", placed, new Date("2026-06-26T02:00:00Z"))).toBe(false);
  });
  it("gtc orders never expire by day", () => {
    expect(isDayExpired("gtc", placed, new Date("2027-01-01T17:00:00Z"))).toBe(false);
  });
});

describe("fillMath (signed positions)", () => {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it("opens a long from flat", () => {
    const m = fillMath(0, 0, "buy", 10, 100);
    expect(m.newQty).toBe(10);
    expect(m.newAvg).toBe(100);
    expect(m.realized).toBeNull();
    expect(m.increasingShares).toBe(10); // full notional consumes buying power
  });

  it("adds to a long — weighted average cost, no realized", () => {
    const m = fillMath(10, 100, "buy", 10, 120);
    expect(m.newQty).toBe(20);
    expect(m.newAvg).toBe(110);
    expect(m.realized).toBeNull();
    expect(m.increasingShares).toBe(10);
  });

  it("partially closes a long — realized on the sold shares, basis unchanged", () => {
    const m = fillMath(10, 100, "sell", 4, 130);
    expect(m.newQty).toBe(6);
    expect(m.newAvg).toBe(100);
    expect(m.realized).toBe((130 - 100) * 4); // +120
    expect(m.increasingShares).toBe(0); // a reduce frees capital
  });

  it("opens a short from flat (sell)", () => {
    const m = fillMath(0, 0, "sell", 5, 400);
    expect(m.newQty).toBe(-5);
    expect(m.newAvg).toBe(400);
    expect(m.realized).toBeNull();
    expect(m.increasingShares).toBe(5); // short open reserves collateral
  });

  it("covers part of a short (buy) — profit when bought back lower", () => {
    const m = fillMath(-5, 400, "buy", 2, 350);
    expect(m.newQty).toBe(-3);
    expect(m.newAvg).toBe(400);
    expect(m.realized).toBe((400 - 350) * 2); // +100 (short profit)
    expect(m.increasingShares).toBe(0);
  });

  it("flips long → short — closes the long (realized) then opens the remainder at price", () => {
    const m = fillMath(10, 100, "sell", 15, 130);
    expect(m.newQty).toBe(-5);
    expect(m.newAvg).toBe(130); // remainder opens at the fill price
    expect(m.realized).toBe((130 - 100) * 10); // +300 on the closed long
    expect(m.increasingShares).toBe(5); // only the new short consumes buying power
  });

  it("flips short → long — closes the short (realized) then opens the remainder", () => {
    const m = fillMath(-4, 400, "buy", 10, 360);
    expect(m.newQty).toBe(6);
    expect(close(m.newAvg, 360)).toBe(true);
    expect(m.realized).toBe((400 - 360) * 4); // +160 covering the short
    expect(m.increasingShares).toBe(6);
  });
});
