import { describe, it, expect } from "vitest";
import { selectCurrentPositions, latestPerFiler, type FilingRecord, type HoldingRecord } from "./ownership-read.js";

const filing = (o: Partial<FilingRecord>): FilingRecord => ({
  accessionNumber: "a",
  filerCik: "0000000001",
  filerName: "Filer",
  filerLabel: null,
  formType: "SC 13D",
  schedule: "13D",
  isAmendment: false,
  subjectName: "Subj",
  subjectTicker: "SUB",
  cusip: null,
  pctOfClass: null,
  sharesOwned: null,
  filedDate: "2024-01-01",
  ...o,
});

describe("selectCurrentPositions", () => {
  it("collapses amendments to the latest filing per (filer, schedule)", () => {
    const rows = [
      filing({ accessionNumber: "orig", filedDate: "2024-01-01", isAmendment: false }),
      filing({ accessionNumber: "amd2", filedDate: "2024-05-01", formType: "SC 13D/A", isAmendment: true, pctOfClass: 9.1 }),
      filing({ accessionNumber: "amd1", filedDate: "2024-03-01", formType: "SC 13D/A", isAmendment: true }),
    ];
    const out = selectCurrentPositions(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ accessionNumber: "amd2", pctOfClass: 9.1, amendmentCount: 3, firstFiledDate: "2024-01-01" });
  });

  it("keeps 13D and 13G as separate positions, 13D first", () => {
    const out = selectCurrentPositions([
      filing({ filerCik: "1", schedule: "13G", formType: "SC 13G", filedDate: "2024-06-01" }),
      filing({ filerCik: "1", schedule: "13D", formType: "SC 13D", filedDate: "2024-02-01" }),
    ]);
    expect(out.map((p) => p.schedule)).toEqual(["13D", "13G"]);
  });

  it("sorts same-schedule positions newest filed first", () => {
    const out = selectCurrentPositions([
      filing({ filerCik: "1", filedDate: "2024-01-01" }),
      filing({ filerCik: "2", filedDate: "2024-09-01" }),
    ]);
    expect(out.map((p) => p.filerCik)).toEqual(["2", "1"]);
  });

  it("returns [] for no rows", () => {
    expect(selectCurrentPositions([])).toEqual([]);
  });
});

const hold = (o: Partial<HoldingRecord>): HoldingRecord => ({
  cik: "0000000001",
  filerName: "Filer",
  filerLabel: null,
  quarter: "2024-03-31",
  shares: 100,
  value: 1000,
  ...o,
});

describe("latestPerFiler", () => {
  it("keeps each filer's latest quarter only", () => {
    const out = latestPerFiler([
      hold({ cik: "1", quarter: "2023-12-31", shares: 50, value: 500 }),
      hold({ cik: "1", quarter: "2024-03-31", shares: 80, value: 800 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ quarter: "2024-03-31", shares: 80, value: 800 });
  });

  it("sums share classes within the latest quarter", () => {
    const out = latestPerFiler([
      hold({ cik: "1", quarter: "2024-03-31", shares: 80, value: 800 }),
      hold({ cik: "1", quarter: "2024-03-31", shares: 20, value: 200 }), // 2nd CUSIP / class
    ]);
    expect(out[0]).toMatchObject({ shares: 100, value: 1000 });
  });

  it("sorts filers by value desc", () => {
    const out = latestPerFiler([
      hold({ cik: "1", value: 500 }),
      hold({ cik: "2", value: 9000 }),
      hold({ cik: "3", value: 1500 }),
    ]);
    expect(out.map((h) => h.cik)).toEqual(["2", "3", "1"]);
  });
});
