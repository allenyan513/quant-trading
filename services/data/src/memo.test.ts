import { describe, it, expect } from "vitest";
import { normalizeMemoType, normalizeDirection, normalizeStatus, normalizeSymbols } from "./memo.js";

describe("normalizeMemoType", () => {
  it("defaults to 'note' when absent/blank", () => {
    expect(normalizeMemoType(undefined)).toBe("note");
    expect(normalizeMemoType("")).toBe("note");
  });
  it("accepts known types, case-insensitive", () => {
    expect(normalizeMemoType("THESIS")).toBe("thesis");
    expect(normalizeMemoType("review")).toBe("review");
    expect(normalizeMemoType("morning_call")).toBe("morning_call");
  });
  it("throws on an unknown type", () => {
    expect(() => normalizeMemoType("rant")).toThrow(/invalid memo type/);
  });
});

describe("normalizeDirection", () => {
  it("absent → null", () => {
    expect(normalizeDirection(undefined)).toBeNull();
    expect(normalizeDirection("")).toBeNull();
  });
  it("accepts long/short/neutral", () => {
    expect(normalizeDirection("Long")).toBe("long");
    expect(normalizeDirection("short")).toBe("short");
    expect(normalizeDirection("neutral")).toBe("neutral");
  });
  it("throws on garbage", () => {
    expect(() => normalizeDirection("up")).toThrow(/invalid direction/);
  });
});

describe("normalizeStatus", () => {
  it("defaults to 'active'", () => {
    expect(normalizeStatus(undefined)).toBe("active");
  });
  it("accepts known statuses, throws otherwise", () => {
    expect(normalizeStatus("closed")).toBe("closed");
    expect(normalizeStatus("archived")).toBe("archived");
    expect(() => normalizeStatus("done")).toThrow(/invalid status/);
  });
});

describe("normalizeSymbols", () => {
  it("uppercases, trims, dedups, drops blanks", () => {
    expect(normalizeSymbols(["nvda", " tsm ", "NVDA", "", null])).toEqual(["NVDA", "TSM"]);
  });
  it("non-array → empty", () => {
    expect(normalizeSymbols(undefined)).toEqual([]);
    expect(normalizeSymbols("NVDA")).toEqual([]);
  });
});
