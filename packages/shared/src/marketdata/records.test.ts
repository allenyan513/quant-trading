import { describe, it, expect } from "vitest";
import {
  mapGradeRecords,
  mapInsiderRecords,
  mapPriceTargetRecords,
  type FmpGrade,
  type FmpInsider,
  type FmpPriceTarget,
} from "./records.js";

describe("mapGradeRecords", () => {
  it("drops no-op maintain reiterations (same grade, not up/down/initiate)", () => {
    const rows: FmpGrade[] = [{ symbol: "AAPL", date: "2026-05-15", action: "maintain", previousGrade: "Buy", newGrade: "Buy" }];
    expect(mapGradeRecords("AAPL", rows)).toHaveLength(0);
  });

  it("keeps a maintain when the grade actually changed", () => {
    const rows: FmpGrade[] = [{ symbol: "AAPL", date: "2026-05-15", action: "maintain", previousGrade: "Hold", newGrade: "Buy" }];
    expect(mapGradeRecords("AAPL", rows)).toHaveLength(1);
  });

  it("keeps explicit upgrade/downgrade/initiate regardless of grade equality", () => {
    const rows: FmpGrade[] = [{ symbol: "AAPL", date: "2026-05-15", action: "upgrade", previousGrade: "Buy", newGrade: "Buy" }];
    expect(mapGradeRecords("AAPL", rows)).toHaveLength(1);
  });

  it("does NOT window-filter (keeps old history — cache slices on read)", () => {
    const rows: FmpGrade[] = [{ symbol: "AAPL", date: "2019-01-01", action: "upgrade", previousGrade: "Hold", newGrade: "Buy" }];
    expect(mapGradeRecords("AAPL", rows)).toHaveLength(1);
  });

  it("builds a stable external_id and UTC-midnight observed_at", () => {
    const [r] = mapGradeRecords("AAPL", [
      { symbol: "AAPL", date: "2026-05-15", action: "upgrade", gradingCompany: "MS", previousGrade: "Hold", newGrade: "Buy" },
    ]);
    expect(r!.externalId).toBe("grade:AAPL:2026-05-15:MS");
    expect(r!.observedAt.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("skips rows without a date", () => {
    expect(mapGradeRecords("AAPL", [{ symbol: "AAPL", action: "upgrade" }])).toHaveLength(0);
  });
});

describe("mapInsiderRecords", () => {
  it("keeps open-market buys/sells, drops gifts/awards/exercises", () => {
    const rows: FmpInsider[] = [
      { transactionType: "P-Purchase", filingDate: "2026-05-15", securitiesTransacted: 100 },
      { transactionType: "S-Sale", filingDate: "2026-05-15", securitiesTransacted: 50 },
      { transactionType: "G-Gift", filingDate: "2026-05-15" },
      { transactionType: "A-Award", filingDate: "2026-05-15" },
    ];
    expect(mapInsiderRecords("AAPL", rows)).toHaveLength(2);
  });

  it("parses an intraday filingDate ET→UTC (no look-ahead), falls back to transactionDate", () => {
    // filingDate is naive ET with a time → must convert (18:30 EDT = 22:30 UTC),
    // NOT truncate to UTC midnight (which would read as 20:00 ET the day before).
    const [withFiling] = mapInsiderRecords("AAPL", [
      { transactionType: "P-Purchase", filingDate: "2026-05-15 18:30:00", securitiesTransacted: 1 },
    ]);
    expect(withFiling!.observedAt.toISOString()).toBe("2026-05-15T22:30:00.000Z");

    // date-only transactionDate fallback → UTC midnight is correct.
    const [withTxnOnly] = mapInsiderRecords("AAPL", [
      { transactionType: "P-Purchase", transactionDate: "2026-05-14", securitiesTransacted: 1 },
    ]);
    expect(withTxnOnly!.observedAt.toISOString()).toBe("2026-05-14T00:00:00.000Z");
  });

  it("skips rows with no filing/transaction date", () => {
    expect(mapInsiderRecords("AAPL", [{ transactionType: "P-Purchase" }])).toHaveLength(0);
  });
});

describe("mapPriceTargetRecords", () => {
  const p = (o: Partial<FmpPriceTarget>): FmpPriceTarget => ({
    symbol: "AAPL",
    publishedDate: "2026-05-15T13:00:00.000Z",
    priceTarget: 250,
    priceWhenPosted: 200,
    analystCompany: "MS",
    ...o,
  });

  it("maps a target and preserves the ISO observed_at", () => {
    const [r] = mapPriceTargetRecords("AAPL", [p({})]);
    expect(r!.externalId).toBe("pt:AAPL:2026-05-15T13:00:00.000Z:MS");
    expect(r!.observedAt.toISOString()).toBe("2026-05-15T13:00:00.000Z");
  });

  it("skips rows missing a target or a published date", () => {
    expect(mapPriceTargetRecords("AAPL", [p({ priceTarget: undefined })])).toHaveLength(0);
    expect(mapPriceTargetRecords("AAPL", [p({ publishedDate: undefined })])).toHaveLength(0);
  });
});
