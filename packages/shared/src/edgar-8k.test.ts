import { describe, it, expect } from "vitest";
import { decodeItems, filingCategory, find8KFilings, type Submissions } from "./edgar-8k.js";

describe("decodeItems", () => {
  it("decodes a CSV to labelled items, most-material first", () => {
    const out = decodeItems("9.01,2.02");
    expect(out.map((i) => i.code)).toEqual(["2.02", "9.01"]); // material before routine
    expect(out[0]).toMatchObject({ code: "2.02", category: "material", label: "Results of Operations (Earnings)" });
    expect(out[1]).toMatchObject({ code: "9.01", category: "routine" });
  });

  it("ranks high-materiality items first", () => {
    expect(decodeItems("8.01,1.03,2.02").map((i) => i.code)).toEqual(["1.03", "2.02", "8.01"]);
  });

  it("passes unknown codes through as routine with a generic label", () => {
    expect(decodeItems("99.99")).toEqual([{ code: "99.99", label: "Item 99.99", category: "routine" }]);
  });

  it("tolerates whitespace + empty", () => {
    expect(decodeItems(" 2.02 , 9.01 ").map((i) => i.code)).toEqual(["2.02", "9.01"]);
    expect(decodeItems("")).toEqual([]);
  });
});

describe("filingCategory", () => {
  it("is the most-material item's category", () => {
    expect(filingCategory("2.02,9.01")).toBe("material");
    expect(filingCategory("1.03")).toBe("high");
    expect(filingCategory("9.01")).toBe("routine");
    expect(filingCategory("")).toBe("routine");
  });
});

describe("find8KFilings", () => {
  const subs: Submissions = {
    filings: {
      recent: {
        form: ["8-K", "10-K", "8-K/A", "4"],
        accessionNumber: ["a1", "a2", "a3", "a4"],
        filingDate: ["2026-04-30", "2026-03-01", "2026-04-20", "2026-05-01"],
        reportDate: ["2026-04-30", "2025-12-31", "2026-04-18", ""],
        acceptanceDateTime: ["2026-04-30T16:30:00.000Z", "", "2026-04-20T08:00:00.000Z", ""],
        items: ["2.02,9.01", "", "5.02", ""],
        primaryDocument: ["a.htm", "b.htm", "c.htm", "d.htm"],
      },
    },
  };

  it("keeps only 8-K + 8-K/A, newest filed first, with items + dates", () => {
    const out = find8KFilings(subs);
    expect(out.map((f) => f.accessionNumber)).toEqual(["a1", "a3"]); // 04-30, 04-20
    expect(out[0]).toMatchObject({
      items: "2.02,9.01",
      reportDate: "2026-04-30",
      acceptedAt: "2026-04-30T16:30:00.000Z",
      primaryDocument: "a.htm",
    });
    expect(out[1]).toMatchObject({ accessionNumber: "a3", items: "5.02" });
  });

  it("skips a filing with no filing date and handles empty payloads", () => {
    const broken: Submissions = {
      filings: { recent: { form: ["8-K"], accessionNumber: ["a1"], filingDate: [""], items: ["8.01"] } },
    };
    expect(find8KFilings(broken)).toEqual([]);
    expect(find8KFilings({})).toEqual([]);
  });
});
