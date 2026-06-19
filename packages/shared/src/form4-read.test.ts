import { describe, it, expect } from "vitest";
import { shapeSecTxn, shapeFmpRow, type SecRow } from "./form4-read.js";

const secRow = (o: Partial<SecRow>): SecRow => ({
  reportingName: "Cook Timothy",
  relationship: "Director, Officer",
  officerTitle: "CEO",
  transactionCode: "P",
  acquiredDisposed: "A",
  shares: 1000,
  pricePerShare: 200,
  securityTitle: "Common Stock",
  isDerivative: false,
  is10b5_1: true,
  transactionDate: "2026-05-01",
  filedDate: "2026-05-03",
  ...o,
});

describe("shapeSecTxn", () => {
  it("decodes the code, computes value, prefers transaction date", () => {
    const t = shapeSecTxn(secRow({}));
    expect(t).toMatchObject({ code: "P", codeLabel: "Open-market buy", signal: "buy", value: 200000, date: "2026-05-01", is10b5_1: true });
  });

  it("handles a footnoted (null) price → null value, and falls back to filed date", () => {
    const t = shapeSecTxn(secRow({ transactionCode: "M", pricePerShare: null, transactionDate: null }));
    expect(t).toMatchObject({ code: "M", signal: "neutral", price: null, value: null, date: "2026-05-03" });
  });
});

describe("shapeFmpRow (fallback)", () => {
  it("derives the code from FMP transactionType + computes value", () => {
    const t = shapeFmpRow(
      { transactionType: "P-Purchase", securitiesTransacted: 500, price: 100, reportingName: "Jane Doe", typeOfOwner: "officer: CFO", transactionDate: "2026-04-01" },
      new Date("2026-04-02T00:00:00Z"),
    );
    expect(t).toMatchObject({ code: "P", signal: "buy", shares: 500, price: 100, value: 50000, reportingName: "Jane Doe", relationship: "officer: CFO", date: "2026-04-01", is10b5_1: false, isDerivative: false });
  });

  it("maps S-Sale to sell and falls back to observedAt for the date", () => {
    const t = shapeFmpRow({ transactionType: "S-Sale", securitiesTransacted: 10 }, new Date("2026-04-02T00:00:00Z"));
    expect(t).toMatchObject({ code: "S", signal: "sell", price: null, value: null, date: "2026-04-02" });
  });
});
