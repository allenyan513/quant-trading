import { describe, it, expect } from "vitest";
import { groupTopNPerDay, type EarningsCalEntry } from "./earnings-read.js";

const e = (symbol: string, reportDate: string, marketCap: number | null): EarningsCalEntry => ({
  symbol,
  reportDate,
  name: symbol,
  epsEstimated: 1,
  epsActual: null,
  revenueEstimated: 1,
  revenueActual: null,
  marketCap,
  sector: null,
  logoUrl: null,
});

describe("groupTopNPerDay", () => {
  it("groups by day, ranks by market cap desc, keeps top-N + day total, date-sorted", () => {
    const rows = [
      e("SMALL", "2026-06-22", 1e9),
      e("BIG", "2026-06-22", 1e12),
      e("MID", "2026-06-22", 5e11),
      e("OTHER", "2026-06-23", 2e11),
    ];
    const days = groupTopNPerDay(rows, 2);
    expect(days.map((d) => d.date)).toEqual(["2026-06-22", "2026-06-23"]);
    expect(days[0]!.total).toBe(3);
    expect(days[0]!.top.map((r) => r.symbol)).toEqual(["BIG", "MID"]); // SMALL dropped by top-2
  });

  it("sorts null market caps last", () => {
    const rows = [e("NOCAP", "2026-06-22", null), e("CAP", "2026-06-22", 1e9)];
    expect(groupTopNPerDay(rows, 2)[0]!.top.map((r) => r.symbol)).toEqual(["CAP", "NOCAP"]);
  });
});
