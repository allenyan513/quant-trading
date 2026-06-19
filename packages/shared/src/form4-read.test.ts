import { describe, it, expect } from "vitest";
import { shapeSecTxn, type SecRow } from "./form4-read.js";

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
