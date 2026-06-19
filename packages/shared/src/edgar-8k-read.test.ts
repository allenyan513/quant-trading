import { describe, it, expect } from "vitest";
import { shape8K, type EightKRow } from "./edgar-8k-read.js";

const row = (o: Partial<EightKRow>): EightKRow => ({
  accessionNumber: "0000320193-26-000001",
  cik: "0000320193",
  filedDate: "2026-04-30",
  reportDate: "2026-04-30",
  items: "2.02,9.01",
  primaryDocument: "aapl-20260430.htm",
  ...o,
});

describe("shape8K", () => {
  it("decodes items, derives the overall category, and builds the EDGAR url", () => {
    const e = shape8K(row({}));
    expect(e.category).toBe("material"); // 2.02 earnings dominates 9.01
    expect(e.items.map((i) => i.code)).toEqual(["2.02", "9.01"]);
    expect(e.filingUrl).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260430.htm");
  });

  it("marks a high-materiality filing", () => {
    expect(shape8K(row({ items: "1.03" })).category).toBe("high"); // bankruptcy
  });

  it("returns a null url when there is no primary document", () => {
    expect(shape8K(row({ primaryDocument: null })).filingUrl).toBeNull();
  });
});
