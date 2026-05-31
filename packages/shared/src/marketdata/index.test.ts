import { describe, it, expect } from "vitest";
import {
  easternToUtc,
  knownAtFrom,
  isStatementFresh,
  isPriceFresh,
  mapStatementRows,
  mapPriceRows,
} from "./index.js";

describe("easternToUtc", () => {
  it("converts EST (winter, -05:00) wall-clock to UTC", () => {
    // 2026-01-15 09:30 ET == 14:30 UTC
    expect(easternToUtc("2026-01-15 09:30:00").toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });

  it("converts EDT (summer, -04:00) wall-clock to UTC", () => {
    // 2026-07-15 09:30 ET == 13:30 UTC
    expect(easternToUtc("2026-07-15 09:30:00").toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });

  it("accepts a 'T' separator and missing seconds", () => {
    expect(easternToUtc("2026-07-15T09:30").toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });
});

describe("knownAtFrom", () => {
  it("uses acceptedDate (ET→UTC) when valid", () => {
    expect(knownAtFrom("2026-05-01 06:01:36", "2026-03-28").toISOString()).toBe("2026-05-01T10:01:36.000Z");
  });
  it("falls back to fiscalDate (UTC midnight) when acceptedDate is missing", () => {
    expect(knownAtFrom(undefined, "2026-03-28").toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });
  it("falls back to fiscalDate when acceptedDate is malformed (no Invalid Date leaks through)", () => {
    expect(knownAtFrom("not-a-date", "2026-03-28").toISOString()).toBe("2026-03-28T00:00:00.000Z");
    expect(knownAtFrom("", "2026-03-28").toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });
});

describe("isStatementFresh", () => {
  const now = new Date("2026-05-30T00:00:00Z");
  it("is stale when there is no data", () => {
    expect(isStatementFresh(null, "quarter", now)).toBe(false);
  });
  it("quarter: fresh within ~100d, stale beyond", () => {
    expect(isStatementFresh("2026-03-31", "quarter", now)).toBe(true); // ~60d
    expect(isStatementFresh("2025-12-31", "quarter", now)).toBe(false); // ~150d
  });
  it("annual: tolerates a much longer gap than quarter", () => {
    expect(isStatementFresh("2025-09-30", "annual", now)).toBe(true); // ~240d
    expect(isStatementFresh("2025-03-31", "quarter", now)).toBe(false); // same age, quarterly → stale
  });
});

describe("isPriceFresh", () => {
  const now = new Date("2026-05-30T12:00:00Z"); // a Saturday
  it("fresh if we have Friday's bar (weekend gap tolerated)", () => {
    expect(isPriceFresh("2026-05-29", now)).toBe(true);
  });
  it("stale if the newest bar is a week old", () => {
    expect(isPriceFresh("2026-05-22", now)).toBe(false);
  });
  it("stale with no data", () => {
    expect(isPriceFresh(null, now)).toBe(false);
  });
});

describe("mapStatementRows", () => {
  it("maps fiscal date + known_at (from acceptedDate) and keeps raw data", () => {
    const rows = mapStatementRows("AAPL", "quarter", [
      { date: "2026-03-28", acceptedDate: "2026-05-01 06:01:36", revenue: 100 },
      { date: "2025-12-28", acceptedDate: "2026-01-30 16:30:00", revenue: 90 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ symbol: "AAPL", period: "quarter", fiscalDate: "2026-03-28" });
    expect(rows[0]!.knownAt.toISOString()).toBe("2026-05-01T10:01:36.000Z"); // EDT -04:00
    expect((rows[0]!.data as { revenue: number }).revenue).toBe(100);
  });
  it("falls back to fiscal date when acceptedDate is missing, and skips rows without a date", () => {
    const rows = mapStatementRows("MSFT", "annual", [{ revenue: 1 }, { date: "2025-06-30" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.knownAt.toISOString()).toBe("2025-06-30T00:00:00.000Z");
  });
});

describe("mapPriceRows", () => {
  it("maps OHLCV and nulls missing fields; skips dateless rows", () => {
    const rows = mapPriceRows("NVDA", [
      { date: "2026-05-29", open: 1, high: 2, low: 0.5, close: 1.5, adjClose: 1.5, volume: 1000 },
      { close: 9 }, // no date → skipped
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      symbol: "NVDA",
      tradeDate: "2026-05-29",
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      adjClose: 1.5,
      volume: 1000,
    });
  });
});
