import { describe, it, expect } from "vitest";
import { limitCrosses, isDayExpired } from "./paper.js";

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
