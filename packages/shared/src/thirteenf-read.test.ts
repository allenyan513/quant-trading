import { describe, it, expect } from "vitest";
import {
  matchFiler,
  changePct,
  splitActivity,
  summarize,
  quarterLabel,
  type FilerRef,
  type HoldingRow,
} from "./thirteenf-read.js";
import type { HoldingChange } from "./thirteenf.js";

// ───────────────────────── matchFiler (CIK or name/label resolution) ─────────────────────────

const FILERS: FilerRef[] = [
  { cik: "0001067983", name: "Berkshire Hathaway Inc", label: "Buffett" },
  { cik: "0001649339", name: "Scion Asset Management, LLC", label: "Burry" },
  { cik: "0001358706", name: "Abrams Capital Management, L.P.", label: "David Abrams" },
];

describe("matchFiler", () => {
  it("resolves a 10-digit CIK", () => {
    const r = matchFiler(FILERS, "0001067983");
    expect(r.ok && r.filer.label).toBe("Buffett");
  });
  it("resolves an unpadded numeric CIK", () => {
    const r = matchFiler(FILERS, "1649339");
    expect(r.ok && r.filer.label).toBe("Burry");
  });
  it("matches a label case-insensitively", () => {
    const r = matchFiler(FILERS, "buffett");
    expect(r.ok && r.filer.cik).toBe("0001067983");
  });
  it("matches a substring of the name", () => {
    const r = matchFiler(FILERS, "berkshire");
    expect(r.ok && r.filer.label).toBe("Buffett");
  });
  it("returns ambiguous with candidates when >1 match", () => {
    const r = matchFiler(FILERS, "management"); // Scion + Abrams Capital Management
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("ambiguous");
    expect(r.ok === false && r.reason === "ambiguous" && r.candidates.length).toBe(2);
  });
  it("breaks ties via an exact label/name match", () => {
    const list: FilerRef[] = [
      { cik: "00A", name: "Alpha Capital", label: "Al" },
      { cik: "00B", name: "Alabama Fund", label: "Alabama" },
    ];
    const r = matchFiler(list, "al"); // substring of both; exact label "Al" wins
    expect(r.ok && r.filer.cik).toBe("00A");
  });
  it("returns not_found for no match", () => {
    const r = matchFiler(FILERS, "zzz");
    expect(r.ok === false && r.reason).toBe("not_found");
  });
  it("returns not_found for an unknown CIK", () => {
    const r = matchFiler(FILERS, "9999999999");
    expect(r.ok === false && r.reason).toBe("not_found");
  });
});

// ───────────────────────── activity split / summary / changePct ─────────────────────────

const hr = (change: HoldingChange, o: Partial<HoldingRow> = {}): HoldingRow => ({
  cusip: o.cusip ?? "C",
  ticker: o.ticker ?? "T",
  issuerName: o.issuerName ?? "Issuer",
  titleOfClass: "COM",
  putCall: o.putCall ?? "",
  value: o.value ?? 100,
  shares: o.shares ?? 0,
  prevShares: o.prevShares ?? 0,
  change,
  pctPortfolio: o.pctPortfolio ?? 0,
  reportedPrice: o.reportedPrice ?? null,
});

describe("changePct", () => {
  it("is null for a brand-new position", () => expect(changePct(hr("new", { shares: 100 }))).toBeNull());
  it("is -100 for an exit", () => expect(changePct(hr("exited", { prevShares: 100 }))).toBe(-100));
  it("is 0 for an unchanged hold", () => expect(changePct(hr("held", { shares: 100, prevShares: 100 }))).toBe(0));
  it("is positive for an add", () => expect(changePct(hr("added", { shares: 150, prevShares: 100 }))).toBe(50));
  it("is negative for a trim", () => expect(changePct(hr("trimmed", { shares: 180, prevShares: 200 }))).toBe(-10));
});

describe("splitActivity", () => {
  const holdings = [
    hr("new", { shares: 10 }),
    hr("added", { shares: 20, prevShares: 10 }),
    hr("held", { shares: 30, prevShares: 30 }),
    hr("trimmed", { shares: 5, prevShares: 10 }),
    hr("exited", { prevShares: 40, value: 0 }),
  ];
  it("current excludes exited names", () => {
    expect(splitActivity(holdings).current.map((h) => h.change)).toEqual(["new", "added", "held", "trimmed"]);
  });
  it("buys = new + added", () => {
    expect(splitActivity(holdings).buys.map((h) => h.change)).toEqual(["new", "added"]);
  });
  it("sells = trimmed + exited", () => {
    expect(splitActivity(holdings).sells.map((h) => h.change)).toEqual(["trimmed", "exited"]);
  });
});

describe("summarize", () => {
  const holdings = [
    hr("new", { value: 10 }),
    hr("added", { value: 20 }),
    hr("held", { value: 30 }),
    hr("trimmed", { value: 5 }),
    hr("exited", { value: 0 }),
  ];
  const s = summarize(holdings);
  it("positions = new+added+held+trimmed (exited excluded)", () => {
    expect(s.positions).toBe(4);
    expect(s.newCount + s.addedCount + s.heldCount + s.trimmedCount).toBe(s.positions);
  });
  it("counts each change bucket", () => {
    expect([s.newCount, s.addedCount, s.heldCount, s.trimmedCount, s.exitedCount]).toEqual([1, 1, 1, 1, 1]);
  });
  it("portfolioValue sums current positions only", () => {
    expect(s.portfolioValue).toBe(65); // 10+20+30+5, exited (0) excluded
  });
});

describe("quarterLabel", () => {
  it("maps quarter-end dates to Q labels", () => {
    expect(quarterLabel("2026-03-31")).toBe("Q1 2026");
    expect(quarterLabel("2025-12-31")).toBe("Q4 2025");
    expect(quarterLabel(null)).toBeNull();
  });
});
