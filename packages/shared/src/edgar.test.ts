import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isQuarterDuration,
  isAnnualDuration,
  selectByEnd,
  mapCompanyFactsToStatements,
  fetchCompanyFacts,
  type CompanyFacts,
  type XbrlFact,
} from "./edgar.js";

const fact = (f: Partial<XbrlFact> & Pick<XbrlFact, "end" | "val" | "filed">): XbrlFact => ({ form: "10-Q", ...f });

describe("fetchCompanyFacts collapses concurrent same-CIK calls", () => {
  afterEach(() => vi.restoreAllMocks());
  it("issues a single network fetch and shares the result", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ facts: {} }), { status: 200 }));
    // Distinct CIK so a prior test's settled in-flight entry can't interfere.
    const [a, b, c] = await Promise.all([
      fetchCompanyFacts(424242),
      fetchCompanyFacts(424242),
      fetchCompanyFacts(424242),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

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

describe("isAnnualDuration", () => {
  it("accepts a ~52-week fiscal year (364 days)", () => {
    expect(isAnnualDuration(fact({ start: "2018-09-30", end: "2019-09-28", val: 1, filed: "2019-10-31" }))).toBe(true);
  });
  it("accepts a calendar year (365 days)", () => {
    expect(isAnnualDuration(fact({ start: "2019-01-01", end: "2019-12-31", val: 1, filed: "2020-02-01" }))).toBe(true);
  });
  it("rejects a ~13-week quarter", () => {
    expect(isAnnualDuration(fact({ start: "2019-09-29", end: "2019-12-28", val: 1, filed: "2020-01-29" }))).toBe(false);
  });
  it("rejects a 9-month YTD duration", () => {
    expect(isAnnualDuration(fact({ start: "2019-01-01", end: "2019-09-30", val: 1, filed: "2019-10-31" }))).toBe(false);
  });
  it("rejects an instant (no start)", () => {
    expect(isAnnualDuration(fact({ end: "2019-09-28", val: 1, filed: "2019-10-31" }))).toBe(false);
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

describe("mapCompanyFactsToStatements (quarter)", () => {
  const { income, balance, cashflow } = mapCompanyFactsToStatements("test", FACTS, "quarter");

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
    const empty = mapCompanyFactsToStatements("x", { facts: {} }, "quarter");
    expect(empty.income).toEqual([]);
    expect(empty.balance).toEqual([]);
    expect(empty.cashflow).toEqual([]);
  });
});

// Annual: a 10-K full fiscal year (end 2019-09-28) across all three statements,
// with a 10-Q quarterly decoy (wrong form) that the annual path must filter out.
const FACTS_ANNUAL: CompanyFacts = {
  entityName: "Annual Co",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            { start: "2018-09-30", end: "2019-09-28", val: 260000, form: "10-K", filed: "2019-10-31" },
            { start: "2019-06-30", end: "2019-09-28", val: 64000, form: "10-Q", filed: "2019-10-31" }, // quarter decoy — wrong form
          ],
        },
      },
      OperatingIncomeLoss: {
        units: { USD: [{ start: "2018-09-30", end: "2019-09-28", val: 63000, form: "10-K", filed: "2019-10-31" }] },
      },
      NetIncomeLoss: {
        units: { USD: [{ start: "2018-09-30", end: "2019-09-28", val: 55000, form: "10-K", filed: "2019-10-31" }] },
      },
      Assets: {
        units: { USD: [{ end: "2019-09-28", val: 338000, form: "10-K", filed: "2019-10-31" }] },
      },
      LongTermDebtNoncurrent: { units: { USD: [{ end: "2019-09-28", val: 90000, form: "10-K", filed: "2019-10-31" }] } },
      LongTermDebtCurrent: { units: { USD: [{ end: "2019-09-28", val: 10000, form: "10-K", filed: "2019-10-31" }] } },
      NetCashProvidedByUsedInOperatingActivities: {
        units: { USD: [{ start: "2018-09-30", end: "2019-09-28", val: 69000, form: "10-K", filed: "2019-10-31" }] },
      },
      DepreciationDepletionAndAmortization: {
        units: { USD: [{ start: "2018-09-30", end: "2019-09-28", val: 12000, form: "10-K", filed: "2019-10-31" }] },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: { USD: [{ start: "2018-09-30", end: "2019-09-28", val: 10000, form: "10-K", filed: "2019-10-31" }] },
      },
    },
  },
};

describe("mapCompanyFactsToStatements (annual)", () => {
  const { income, balance, cashflow } = mapCompanyFactsToStatements("annl", FACTS_ANNUAL, "annual");

  it("picks the 10-K full-year figure and tags period FY (quarter decoy excluded)", () => {
    expect(income).toHaveLength(1);
    const r = income[0]!;
    expect(r.symbol).toBe("ANNL");
    expect(r.date).toBe("2019-09-28");
    expect(r.period).toBe("FY");
    expect(r.revenue).toBe(260000); // not the 64000 10-Q quarter
    expect(r.netIncome).toBe(55000);
    expect(r.acceptedDate).toBe("2019-10-31");
  });

  it("derives full-year EBITDA, total debt, and free cash flow", () => {
    expect(income[0]!.ebitda).toBe(75000); // 63000 + 12000
    expect(balance[0]!.totalDebt).toBe(100000); // 90000 + 10000
    const cf = cashflow[0]!;
    expect(cf.capitalExpenditure).toBe(-10000); // sign-flipped
    expect(cf.freeCashFlow).toBe(59000); // 69000 - 10000
  });

  it("ignores 10-K facts when asked for quarter (form gate is symmetric)", () => {
    const q = mapCompanyFactsToStatements("annl", FACTS_ANNUAL, "quarter");
    // Only the 10-Q revenue fact survives; 10-K-only fields (netIncome, …) are gated out.
    expect(q.income[0]?.revenue).toBe(64000); // the 10-Q quarter, not the 260000 annual
    expect(q.income[0]?.netIncome).toBeUndefined();
  });
});

// A filer that migrated its revenue tag mid-history: older year under
// `RevenueFromContractWithCustomerExcludingAssessedTax`, newer under `Revenues`
// (NVDA does exactly this). Neither concept alone covers all years; resolve()
// must merge by period-end so every year keeps a revenue.
const FACTS_TAG_MIGRATION: CompanyFacts = {
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [{ start: "2021-01-01", end: "2021-12-31", val: 100, form: "10-K", filed: "2022-02-01" }] },
      },
      Revenues: {
        units: { USD: [{ start: "2022-01-01", end: "2022-12-31", val: 200, form: "10-K", filed: "2023-02-01" }] },
      },
    },
  },
};

describe("resolve merges candidate concepts by period-end", () => {
  it("keeps revenue for years that switched us-gaap tag", () => {
    const { income } = mapCompanyFactsToStatements("mig", FACTS_TAG_MIGRATION, "annual");
    const byEnd = Object.fromEntries(income.map((r) => [r.date, r.revenue]));
    expect(byEnd["2021-12-31"]).toBe(100); // from RevenueFromContractWithCustomer…
    expect(byEnd["2022-12-31"]).toBe(200); // from Revenues — would be dropped by first-match-wins
  });
});
