import { describe, it, expect } from "vitest";
import { easternToUtcIso } from "./dates.js";

describe("easternToUtcIso (FMP news publishedDate is naive US-Eastern)", () => {
  it("converts EDT (summer, -04:00) to UTC", () => {
    expect(easternToUtcIso("2026-05-30 03:30:00")).toBe("2026-05-30T07:30:00.000Z");
  });

  it("converts EST (winter, -05:00) to UTC", () => {
    expect(easternToUtcIso("2026-01-15 15:00:00")).toBe("2026-01-15T20:00:00.000Z");
  });

  it("tolerates a T separator", () => {
    expect(easternToUtcIso("2026-05-30T03:30:00")).toBe("2026-05-30T07:30:00.000Z");
  });

  it("handles missing seconds", () => {
    expect(easternToUtcIso("2026-05-30 03:30")).toBe("2026-05-30T07:30:00.000Z");
  });

  it("returns null for unparseable input", () => {
    expect(easternToUtcIso("not a date")).toBeNull();
    expect(easternToUtcIso("")).toBeNull();
  });
});
