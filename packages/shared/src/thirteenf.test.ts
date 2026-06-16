import { describe, it, expect } from "vitest";
import {
  find13FFilings,
  latestPerPeriod,
  pickInfoTableDoc,
  parseInfoTable,
  normalizeValue,
  aggregateHoldings,
  diffHoldings,
  padCik,
  accnNoDashes,
  type Submissions,
  type Holding13F,
} from "./thirteenf.js";

describe("padCik / accnNoDashes", () => {
  it("zero-pads CIK to 10 digits", () => {
    expect(padCik(1067983)).toBe("0001067983");
  });
  it("strips dashes from accession", () => {
    expect(accnNoDashes("0001067983-25-000123")).toBe("000106798325000123");
  });
});

describe("find13FFilings", () => {
  const subs: Submissions = {
    filings: {
      recent: {
        accessionNumber: ["a-1", "a-2", "a-3", "a-4"],
        form: ["13F-HR", "10-K", "13F-HR", "13F-HR/A"],
        reportDate: ["2025-03-31", "2024-12-31", "2024-12-31", "2024-12-31"],
        filingDate: ["2025-05-15", "2025-02-01", "2025-02-14", "2025-03-01"],
      },
    },
  };

  it("keeps only 13F-HR and 13F-HR/A, newest report period first", () => {
    const f = find13FFilings(subs);
    expect(f.map((x) => x.accessionNumber)).toEqual(["a-1", "a-4", "a-3"]);
    expect(f.every((x) => x.form.startsWith("13F-HR"))).toBe(true);
  });

  it("returns [] when no filings present", () => {
    expect(find13FFilings({})).toEqual([]);
    expect(find13FFilings({ filings: { recent: {} } })).toEqual([]);
  });
});

describe("latestPerPeriod", () => {
  it("collapses a period to its newest-filed filing (amendment supersedes)", () => {
    const f = latestPerPeriod(find13FFilings({
      filings: {
        recent: {
          accessionNumber: ["orig", "amend"],
          form: ["13F-HR", "13F-HR/A"],
          reportDate: ["2024-12-31", "2024-12-31"],
          filingDate: ["2025-02-14", "2025-03-01"],
        },
      },
    }));
    expect(f).toHaveLength(1);
    expect(f[0]!.accessionNumber).toBe("amend");
  });
});

describe("pickInfoTableDoc", () => {
  it("prefers a name that looks like an info table", () => {
    const doc = pickInfoTableDoc({
      directory: { item: [{ name: "primary_doc.xml" }, { name: "form13fInfoTable.xml" }, { name: "0001-25.txt" }] },
    });
    expect(doc).toBe("form13fInfoTable.xml");
  });
  it("falls back to a non-cover xml when no info-table name", () => {
    const doc = pickInfoTableDoc({ directory: { item: [{ name: "primary_doc.xml" }, { name: "table123.xml" }] } });
    expect(doc).toBe("table123.xml");
  });
  it("returns null when no xml present", () => {
    expect(pickInfoTableDoc({ directory: { item: [{ name: "a.txt" }] } })).toBeNull();
    expect(pickInfoTableDoc({})).toBeNull();
  });
});

describe("parseInfoTable", () => {
  it("parses rows, preserving CUSIP leading zeros and reading shares/putCall", () => {
    const xml = `<?xml version="1.0"?>
      <informationTable>
        <infoTable>
          <nameOfIssuer>APPLE INC</nameOfIssuer>
          <titleOfClass>COM</titleOfClass>
          <cusip>037833100</cusip>
          <value>1000</value>
          <shrsOrPrnAmt><sshPrnamt>50</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
          <investmentDiscretion>SOLE</investmentDiscretion>
        </infoTable>
        <infoTable>
          <nameOfIssuer>SPDR S&amp;P 500</nameOfIssuer>
          <titleOfClass>PUT</titleOfClass>
          <cusip>78462F103</cusip>
          <value>500</value>
          <shrsOrPrnAmt><sshPrnamt>10</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
          <putCall>Put</putCall>
        </infoTable>
      </informationTable>`;
    const rows = parseInfoTable(xml);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cusip: "037833100", nameOfIssuer: "APPLE INC", value: 1000, shares: 50, putCall: "" });
    expect(rows[1]!.putCall).toBe("Put");
  });

  it("tolerates namespace prefixes and a single-row table", () => {
    const xml = `<ns1:informationTable xmlns:ns1="x">
      <ns1:infoTable>
        <ns1:nameOfIssuer>NVIDIA</ns1:nameOfIssuer>
        <ns1:cusip>67066G104</ns1:cusip>
        <ns1:value>2000</ns1:value>
        <ns1:shrsOrPrnAmt><ns1:sshPrnamt>7</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
      </ns1:infoTable>
    </ns1:informationTable>`;
    const rows = parseInfoTable(xml);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cusip: "67066G104", value: 2000, shares: 7 });
  });
});

describe("normalizeValue", () => {
  it("scales pre-2023-01-03 filings from thousands to whole dollars", () => {
    expect(normalizeValue(1000, "2022-11-14")).toBe(1_000_000);
  });
  it("leaves on/after-cutoff filings as whole dollars", () => {
    expect(normalizeValue(1000, "2023-02-14")).toBe(1000);
    expect(normalizeValue(1000, "2023-01-03")).toBe(1000);
  });
});

describe("aggregateHoldings", () => {
  it("merges same (cusip, putCall), normalizes value, sorts by value desc", () => {
    const entries = [
      { nameOfIssuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", value: 100, shares: 5, sshPrnamtType: "SH", putCall: "" },
      { nameOfIssuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", value: 50, shares: 3, sshPrnamtType: "SH", putCall: "" },
      { nameOfIssuer: "NVIDIA", titleOfClass: "COM", cusip: "67066G104", value: 1000, shares: 9, sshPrnamtType: "SH", putCall: "" },
    ];
    const out = aggregateHoldings(entries, "2022-11-14"); // thousands → ×1000
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ cusip: "67066G104", value: 1_000_000, shares: 9 });
    expect(out[1]).toMatchObject({ cusip: "037833100", value: 150_000, shares: 8 });
  });

  it("keeps a put line distinct from the share line on the same issuer", () => {
    const entries = [
      { nameOfIssuer: "SPY", titleOfClass: "ETF", cusip: "78462F103", value: 100, shares: 5, sshPrnamtType: "SH", putCall: "" },
      { nameOfIssuer: "SPY", titleOfClass: "PUT", cusip: "78462F103", value: 200, shares: 2, sshPrnamtType: "SH", putCall: "Put" },
    ];
    const out = aggregateHoldings(entries, "2023-05-14");
    expect(out).toHaveLength(2);
  });
});

describe("diffHoldings", () => {
  const h = (cusip: string, shares: number, putCall = ""): Holding13F => ({
    cusip,
    issuerName: cusip,
    titleOfClass: "COM",
    value: shares,
    shares,
    putCall,
  });

  it("classifies new / added / trimmed / held / exited", () => {
    const prev = [h("A", 10), h("B", 20), h("C", 30)];
    const curr = [h("A", 10), h("B", 25), h("C", 5), h("D", 100)];
    const deltas = diffHoldings(curr, prev);
    const byCusip = Object.fromEntries(deltas.map((d) => [d.cusip, d.change]));
    expect(byCusip).toEqual({ A: "held", B: "added", C: "trimmed", D: "new" });
    // no exits here: all prev appear in curr
    expect(deltas.find((d) => d.change === "exited")).toBeUndefined();
  });

  it("includes exited names absent from the current quarter", () => {
    const deltas = diffHoldings([h("A", 10)], [h("A", 10), h("B", 20)]);
    const exited = deltas.find((d) => d.cusip === "B");
    expect(exited).toMatchObject({ change: "exited", shares: 0, prevShares: 20 });
  });
});
