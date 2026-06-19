import { describe, it, expect } from "vitest";
import { parseDisplayName, shapeHit, buildSearchUrl } from "./edgar-fts.js";

describe("parseDisplayName", () => {
  it("splits company, ticker, cik when a ticker is present", () => {
    expect(parseDisplayName("D-Wave Quantum Inc.  (QBTS)  (CIK 0001907982)")).toEqual({
      company: "D-Wave Quantum Inc.",
      ticker: "QBTS",
      cik: "0001907982",
    });
  });
  it("handles a filer with no ticker (funds / individuals)", () => {
    expect(parseDisplayName("Some Capital Management LP (CIK 0001234567)")).toEqual({
      company: "Some Capital Management LP",
      ticker: null,
      cik: "0001234567",
    });
  });
  it("does not mistake a parenthetical in the name for a ticker", () => {
    const r = parseDisplayName("Acme (Holdings) Inc. (ACME) (CIK 0000999999)");
    expect(r).toEqual({ company: "Acme (Holdings) Inc.", ticker: "ACME", cik: "0000999999" });
  });
  it("takes the first of dual-class / warrant tickers", () => {
    expect(parseDisplayName("Rigetti Computing, Inc.  (RGTI, RGTIW)  (CIK 0001838359)")).toEqual({
      company: "Rigetti Computing, Inc.",
      ticker: "RGTI",
      cik: "0001838359",
    });
  });
});

describe("shapeHit", () => {
  const hit = {
    _id: "0001907982-26-000052:exhibit991d-waveannouncesq.htm",
    _source: {
      adsh: "0001907982-26-000052",
      ciks: ["0001907982"],
      display_names: ["D-Wave Quantum Inc.  (QBTS)  (CIK 0001907982)"],
      form: "8-K",
      file_date: "2026-05-05",
      file_type: "EX-99.1",
      items: ["7.01", "9.01"],
    },
  };
  it("shapes a hit with an un-padded CIK in the direct document URL", () => {
    expect(shapeHit(hit)).toEqual({
      accession: "0001907982-26-000052",
      form: "8-K",
      filedDate: "2026-05-05",
      company: "D-Wave Quantum Inc.",
      ticker: "QBTS",
      cik: "0001907982",
      items: ["7.01", "9.01"],
      fileType: "EX-99.1",
      url: "https://www.sec.gov/Archives/edgar/data/1907982/000190798226000052/exhibit991d-waveannouncesq.htm",
    });
  });
  it("drops a hit with no accession", () => {
    expect(shapeHit({ _id: "x", _source: { form: "8-K" } })).toBeNull();
  });
});

describe("buildSearchUrl", () => {
  it("encodes the query and omits filters when absent", () => {
    expect(buildSearchUrl('"quantum computing"')).toBe(
      "https://efts.sec.gov/LATEST/search-index?q=%22quantum+computing%22",
    );
  });
  it("adds forms and a custom date range", () => {
    const u = new URL(buildSearchUrl("lithium", { forms: ["8-K", "10-K"], startDate: "2026-01-01", endDate: "2026-06-01" }));
    expect(u.searchParams.get("forms")).toBe("8-K,10-K");
    expect(u.searchParams.get("dateRange")).toBe("custom");
    expect(u.searchParams.get("startdt")).toBe("2026-01-01");
    expect(u.searchParams.get("enddt")).toBe("2026-06-01");
  });
});
