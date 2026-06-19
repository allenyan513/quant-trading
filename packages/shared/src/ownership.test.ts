import { describe, it, expect } from "vitest";
import {
  classifyForm,
  findOwnershipFilings,
  parseOwnershipHeader,
  parseCoverPage,
  type Submissions,
} from "./ownership.js";

// Real Icahn / Southwest Gas SC 13D/A header (accession 0001539497-24-002482),
// trimmed to the load-bearing tags. Verified against live EDGAR.
const ICAHN_SWX_HEADER = `<SEC-HEADER>
<ACCESSION-NUMBER>0001539497-24-002482
<TYPE>SC 13D/A
<FILING-DATE>20241120
<GROUP-MEMBERS>BECKTON CORP.
<GROUP-MEMBERS>ICAHN CAPITAL LP
<GROUP-MEMBERS>ICAHN ENTERPRISES HOLDINGS L.P.
<SUBJECT-COMPANY>
<COMPANY-DATA>
<CONFORMED-NAME>Southwest Gas Holdings, Inc.
<CIK>0001692115
</COMPANY-DATA>
<FORM-TYPE>SC 13D/A
</SUBJECT-COMPANY>
<FILED-BY>
<COMPANY-DATA>
<CONFORMED-NAME>ICAHN CARL C
<CIK>0000921669
</COMPANY-DATA>
<FORM-TYPE>SC 13D/A
<FORMER-CONFORMED-NAME>ICAHN CARL C ET AL
</FILED-BY>
</SEC-HEADER>`;

describe("classifyForm", () => {
  it("derives schedule + amendment flag from the four form strings", () => {
    expect(classifyForm("SC 13D")).toEqual({ schedule: "13D", isAmendment: false });
    expect(classifyForm("SC 13D/A")).toEqual({ schedule: "13D", isAmendment: true });
    expect(classifyForm("SC 13G")).toEqual({ schedule: "13G", isAmendment: false });
    expect(classifyForm("SC 13G/A")).toEqual({ schedule: "13G", isAmendment: true });
  });
});

describe("findOwnershipFilings", () => {
  const subs: Submissions = {
    filings: {
      recent: {
        form: ["10-K", "SC 13D", "SC 13G/A", "SC 13D/A", "8-K"],
        accessionNumber: ["a0", "a1", "a2", "a3", "a4"],
        filingDate: ["2024-01-01", "2024-03-01", "2024-02-01", "2024-04-01", "2024-05-01"],
        reportDate: ["", "", "", "", ""], // 13D/13G have no period-of-report
        primaryDocument: ["x.htm", "d1.htm", "d2.htm", "d3.htm", "x.htm"],
      },
    },
  };

  it("keeps only the four ownership forms, newest filed first", () => {
    const out = findOwnershipFilings(subs);
    expect(out.map((f) => f.accessionNumber)).toEqual(["a3", "a1", "a2"]); // 04-01, 03-01, 02-01
    expect(out.map((f) => f.form)).toEqual(["SC 13D/A", "SC 13D", "SC 13G/A"]);
  });

  it("derives schedule/isAmendment and carries the cover doc name", () => {
    const byAcc = Object.fromEntries(findOwnershipFilings(subs).map((f) => [f.accessionNumber, f]));
    expect(byAcc.a1).toMatchObject({ schedule: "13D", isAmendment: false, primaryDocument: "d1.htm" });
    expect(byAcc.a2).toMatchObject({ schedule: "13G", isAmendment: true });
    expect(byAcc.a3).toMatchObject({ schedule: "13D", isAmendment: true });
  });

  it("skips a filing with an empty filingDate (would break known_at)", () => {
    const broken: Submissions = {
      filings: { recent: { form: ["SC 13D"], accessionNumber: ["a1"], filingDate: [""], primaryDocument: ["d.htm"] } },
    };
    expect(findOwnershipFilings(broken)).toEqual([]);
  });

  it("returns [] for a payload with no recent filings", () => {
    expect(findOwnershipFilings({})).toEqual([]);
  });
});

describe("parseOwnershipHeader", () => {
  it("extracts subject company + filer from a real Icahn 13D/A header", () => {
    const h = parseOwnershipHeader(ICAHN_SWX_HEADER);
    expect(h).not.toBeNull();
    expect(h!.subjectCik).toBe("0001692115");
    expect(h!.subjectName).toBe("Southwest Gas Holdings, Inc.");
    expect(h!.filerName).toBe("ICAHN CARL C"); // NOT the <FORMER-CONFORMED-NAME>
    expect(h!.groupMembers).toContain("ICAHN CAPITAL LP");
    expect(h!.groupMembers.length).toBe(3);
  });

  it("pads a short subject CIK to 10 digits", () => {
    const sgml = `<SUBJECT-COMPANY>\n<COMPANY-DATA>\n<CONFORMED-NAME>Foo Inc\n<CIK>320193\n</COMPANY-DATA>\n</SUBJECT-COMPANY>`;
    expect(parseOwnershipHeader(sgml)!.subjectCik).toBe("0000320193");
  });

  it("returns null when there is no subject company", () => {
    expect(parseOwnershipHeader("<FILED-BY>\n<CONFORMED-NAME>Someone\n</FILED-BY>")).toBeNull();
  });
});

describe("parseCoverPage (best-effort, nullable)", () => {
  it("parses cusip, percent, and shares from a clean cover", () => {
    const html = `<p>CUSIP No. 844895102</p>
      <td>AGGREGATE AMOUNT BENEFICIALLY OWNED BY EACH REPORTING PERSON</td><td>3,500,000</td>
      <td>PERCENT OF CLASS REPRESENTED BY AMOUNT IN ROW (11)</td><td>4.9%</td>`;
    expect(parseCoverPage(html)).toEqual({ cusip: "844895102", pctOfClass: 4.9, sharesOwned: 3500000 });
  });

  it("still gets the CUSIP when the percent is detached from its label (null contract)", () => {
    // Real-world failure mode: the % sits in a far table cell with no nearby '%'.
    const html = `<p>CUSIP No. 844895102</p><table><tr><td>Percent of class represented by amount in row</td></tr>
      ${"<td>x</td>".repeat(40)}<tr><td>4.9</td></tr></table>`;
    const out = parseCoverPage(html);
    expect(out.cusip).toBe("844895102");
    expect(out.pctOfClass).toBeNull();
  });

  it("returns all-null on an unparseable blob, never throws", () => {
    expect(parseCoverPage("<html>nothing useful here</html>")).toEqual({ cusip: null, pctOfClass: null, sharesOwned: null });
  });

  it("only scans the first 250KB (perf guard) — content past the cap is ignored", () => {
    const html = `<p>CUSIP No. 844895102</p>${"x".repeat(260_000)}<td>PERCENT OF CLASS REPRESENTED</td><td>99%</td>`;
    const out = parseCoverPage(html);
    expect(out.cusip).toBe("844895102"); // at the start → parsed
    expect(out.pctOfClass).toBeNull(); // beyond 250KB → not scanned
  });
});
