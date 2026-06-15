import { describe, it, expect } from "vitest";
import { isQuarterDuration, selectByEnd, mapCompanyFactsToStatements, type CompanyFacts, type XbrlFact } from "./edgar.js";

const fact = (f: Partial<XbrlFact> & Pick<XbrlFact, "end" | "val" | "filed">): XbrlFact => ({ form: "10-Q", ...f });

describe("isQuarterDuration", () => {
  it("accepts a ~13-week quarter (91 days)", () => {
    expect(isQuarterDuration(fact({ start: "2019-09-29", end: "2019-12-28", val: 1, filed: "2020-01-29" }))).toBe(true);
  });
  it("rejects a 6-month YTD duration", () => {
    expect(isQuarterDuration(fact({ start: "2019-06-30", end: "2019-12-28", val: 1, filed: "2020-01-29" }))).toBe(false);
  });
  it("rejects an annual duration", () => {
    expect(isQuarterDuration(fact({ start: "2019-01-01", end: "2019-12-31", val: 1, filed: "2020-02-01" }))).toBe(false);
  });
  it("rejects an instant (no start)", () => {
    expect(isQuarterDuration(fact({ end: "2019-12-28", val: 1, filed: "2020-01-29" }))).toBe(false);
  });
});

describe("selectByEnd", () => {
  it("keeps only 10-Q facts and picks the earliest-filed per period end (PIT original)", () => {
    const facts: XbrlFact[] = [
      fact({ start: "2019-09-29", end: "2019-12-28", val: 100, filed: "2020-01-29" }), // original
      fact({ start: "2019-09-29", end: "2019-12-28", val: 105, filed: "2020-10-30" }), // restated comparative — ignored
      { form: "10-K", start: "2019-09-29", end: "2019-12-28", val: 999, filed: "2020-11-01" }, // wrong form — ignored
    ];
    const picks = selectByEnd(facts, isQuarterDuration);
    expect(picks.get("2019-12-28")).toEqual({ val: 100, filed: "2020-01-29" });
  });
});

// Minimal companyfacts: one quarter (end 2019-12-28) across all three statements,
// with YTD / annual / wrong-form decoys that must be filtered out.
const FACTS: CompanyFacts = {
  entityName: "Test Co",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            { start: "2019-09-29", end: "2019-12-28", val: 1000, form: "10-Q", filed: "2020-01-29" },
            { start: "2019-06-30", end: "2019-12-28", val: 2000, form: "10-Q", filed: "2020-01-29" }, // YTD decoy
          ],
        },
      },
      OperatingIncomeLoss: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 300, form: "10-Q", filed: "2020-01-29" }] },
      },
      NetIncomeLoss: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 250, form: "10-Q", filed: "2020-01-29" }] },
      },
      EarningsPerShareDiluted: {
        units: { "USD/shares": [{ start: "2019-09-29", end: "2019-12-28", val: 1.25, form: "10-Q", filed: "2020-01-29" }] },
      },
      Assets: {
        units: { USD: [{ end: "2019-12-28", val: 50000, form: "10-Q", filed: "2020-01-29" }] },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: { USD: [{ end: "2019-12-28", val: 8000, form: "10-Q", filed: "2020-01-29" }] },
      },
      LongTermDebtNoncurrent: { units: { USD: [{ end: "2019-12-28", val: 4000, form: "10-Q", filed: "2020-01-29" }] } },
      LongTermDebtCurrent: { units: { USD: [{ end: "2019-12-28", val: 1000, form: "10-Q", filed: "2020-01-29" }] } },
      NetCashProvidedByUsedInOperatingActivities: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 400, form: "10-Q", filed: "2020-01-29" }] },
      },
      DepreciationDepletionAndAmortization: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 90, form: "10-Q", filed: "2020-01-29" }] },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 120, form: "10-Q", filed: "2020-01-29" }] },
      },
      PaymentsOfDividendsCommonStock: {
        units: { USD: [{ start: "2019-09-29", end: "2019-12-28", val: 60, form: "10-Q", filed: "2020-01-29" }] },
      },
    },
  },
};

describe("mapCompanyFactsToStatements", () => {
  const { income, balance, cashflow } = mapCompanyFactsToStatements("test", FACTS);

  it("maps income concepts to FMP field names, quarterly only (YTD excluded)", () => {
    expect(income).toHaveLength(1);
    const r = income[0]!;
    expect(r.symbol).toBe("TEST");
    expect(r.date).toBe("2019-12-28");
    expect(r.revenue).toBe(1000); // not the 2000 YTD
    expect(r.netIncome).toBe(250);
    expect(r.epsDiluted).toBe(1.25);
    expect(r.acceptedDate).toBe("2020-01-29");
  });

  it("derives EBITDA = operatingIncome + D&A", () => {
    expect(income[0]!.ebitda).toBe(390);
  });

  it("composes total debt from current + non-current", () => {
    expect(balance[0]!.totalDebt).toBe(5000);
    expect(balance[0]!.cashAndCashEquivalents).toBe(8000);
  });

  it("negates outflows to FMP sign and derives free cash flow", () => {
    const r = cashflow[0]!;
    expect(r.operatingCashFlow).toBe(400);
    expect(r.capitalExpenditure).toBe(-120); // sign-flipped
    expect(r.commonDividendsPaid).toBe(-60); // sign-flipped
    expect(r.freeCashFlow).toBe(280); // 400 - 120
  });

  it("returns empty statements for a payload with no us-gaap facts", () => {
    const empty = mapCompanyFactsToStatements("x", { facts: {} });
    expect(empty.income).toEqual([]);
    expect(empty.balance).toEqual([]);
    expect(empty.cashflow).toEqual([]);
  });
});
