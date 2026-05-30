import { describe, it, expect } from "vitest";
import { latestPerSymbol } from "./_latest.js";
import type { EventPayload } from "@qt/shared";

const ev = (symbol: string, observed_at: string | null, id = `${symbol}:${observed_at}`): EventPayload => ({
  source: "fmp",
  external_id: id,
  symbol,
  event_type: "news",
  direction_hint: null,
  headline: null,
  observed_at,
  raw: {},
});

describe("latestPerSymbol", () => {
  it("returns [] for empty input", () => {
    expect(latestPerSymbol([])).toEqual([]);
  });

  it("keeps the most-recent event per symbol", () => {
    const out = latestPerSymbol([
      ev("AAPL", "2026-05-01T00:00:00Z"),
      ev("AAPL", "2026-05-03T00:00:00Z"),
      ev("AAPL", "2026-05-02T00:00:00Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.observed_at).toBe("2026-05-03T00:00:00Z");
  });

  it("keeps symbols independent (one latest each)", () => {
    const out = latestPerSymbol([
      ev("AAPL", "2026-05-01T00:00:00Z"),
      ev("MSFT", "2026-05-09T00:00:00Z"),
      ev("MSFT", "2026-05-08T00:00:00Z"),
    ]);
    const bySym = Object.fromEntries(out.map((e) => [e.symbol, e.observed_at]));
    expect(out).toHaveLength(2);
    expect(bySym).toEqual({ AAPL: "2026-05-01T00:00:00Z", MSFT: "2026-05-09T00:00:00Z" });
  });

  it("mixes date-only and ISO-Z observed_at correctly", () => {
    const out = latestPerSymbol([ev("X", "2026-05-10"), ev("X", "2026-05-10T12:00:00Z")]);
    expect(out[0]!.observed_at).toBe("2026-05-10T12:00:00Z");
  });

  it("treats null/unparseable observed_at as oldest", () => {
    const out = latestPerSymbol([ev("X", null), ev("X", "2026-01-01T00:00:00Z")]);
    expect(out[0]!.observed_at).toBe("2026-01-01T00:00:00Z");
  });
});
