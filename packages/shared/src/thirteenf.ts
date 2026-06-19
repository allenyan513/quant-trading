/**
 * SEC Form 13F-HR client + parsers — the free, official source for institutional
 * managers' (Berkshire, Scion, Pershing Square, …) quarterly U.S. equity
 * holdings. Managers with >$100M in 13F securities must file within 45 days of
 * quarter end; the holdings live in an XML "information table" inside the filing.
 *
 * Flow (all SEC, no key):
 *   submissions/CIK{cik}.json     → locate the latest 13F-HR accession + period
 *   Archives/.../{accn}/index.json → find the information-table .xml document
 *   Archives/.../{accn}/{doc}.xml  → parse infoTable rows → holdings
 *
 * Pure parsers (unit-tested) + thin client, no DB — mirrors edgar.ts / fmp.ts.
 * Persistence wiring lives in services/data/src/thirteenf/. Honest limits: 45-day
 * lag (last quarter's book, not live), U.S. long positions only (puts are listed;
 * no shorts/cash/foreign/debt), and holdings carry only a CUSIP — the
 * CUSIP→ticker map is resolved separately (self-maintained table).
 */
import { secGet } from "./sec-http.js";

const SEC_DATA_BASE = "https://data.sec.gov";
const SEC_WWW_BASE = "https://www.sec.gov";

/** 10-digit zero-padded CIK as the submissions path expects. */
export const padCik = (cik: number): string => String(cik).padStart(10, "0");

/** Accession number with dashes stripped, as the Archives directory path uses. */
export const accnNoDashes = (accn: string): string => accn.replace(/-/g, "");

// ───────────────────────── submissions → latest 13F filings ─────────────────────────

interface SubmissionsRecent {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  form?: string[];
  primaryDocument?: string[];
}
export interface Submissions {
  cik?: number;
  name?: string;
  /** The entity's listed tickers (subject companies use this for CIK→ticker). */
  tickers?: string[];
  filings?: { recent?: SubmissionsRecent };
}

export interface Filing13F {
  accessionNumber: string;
  /** Period of report = the calendar quarter end the holdings are as of (PIT identity). */
  reportDate: string;
  /** Filing date → known_at (PIT) and the thousands-vs-dollars value cutoff. */
  filingDate: string;
  form: string; // "13F-HR" | "13F-HR/A"
}

/**
 * Pure: pluck all 13F-HR (and amendment 13F-HR/A) filings from a submissions
 * payload, newest report-period first. Amendments are kept — they restate a
 * quarter and the caller (filing newest-filed for a given reportDate) supersedes
 * the original. Only the `recent` page is read (covers ~1000 filings ≫ years of
 * quarterly 13Fs).
 */
export function find13FFilings(subs: Submissions): Filing13F[] {
  const r = subs.filings?.recent;
  if (!r?.form || !r.accessionNumber) return [];
  const out: Filing13F[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (form !== "13F-HR" && form !== "13F-HR/A") continue;
    const accessionNumber = r.accessionNumber[i];
    const reportDate = r.reportDate?.[i] ?? "";
    const filingDate = r.filingDate?.[i] ?? "";
    // filingDate is required: it becomes known_at (NOT NULL) and the value cutoff;
    // an empty one would make `new Date("T00:00:00Z")` Invalid → DB write failure.
    if (!accessionNumber || !reportDate || !filingDate) continue;
    out.push({ accessionNumber, reportDate, filingDate, form });
  }
  // Newest report period first; for the same period, newest-filed first
  // (an amendment supersedes the original it restates).
  return out.sort((a, b) =>
    a.reportDate === b.reportDate ? b.filingDate.localeCompare(a.filingDate) : b.reportDate.localeCompare(a.reportDate),
  );
}

/**
 * Pure: among 13F filings, keep the authoritative one per report period (the
 * newest-filed, so an amendment wins), newest period first.
 */
export function latestPerPeriod(filings: Filing13F[]): Filing13F[] {
  const byPeriod = new Map<string, Filing13F>();
  for (const f of filings) {
    const prev = byPeriod.get(f.reportDate);
    if (!prev || f.filingDate > prev.filingDate) byPeriod.set(f.reportDate, f);
  }
  return [...byPeriod.values()].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

// ───────────────────────── filing index → information-table doc ─────────────────────────

interface FilingIndex {
  directory?: { item?: { name: string; type?: string }[] };
}

/**
 * Pure: find the information-table XML document name in a filing's index.json.
 * Prefer a name that looks like an info table; otherwise fall back to the only
 * (or any) `.xml` that isn't the primary 13F cover document. The cover/primary
 * doc is itself XML, so we exclude obvious headers and prefer the table name.
 */
export function pickInfoTableDoc(index: FilingIndex): string | null {
  const items = index.directory?.item ?? [];
  const xmls = items.map((i) => i?.name).filter((n): n is string => typeof n === "string" && /\.xml$/i.test(n));
  if (xmls.length === 0) return null;
  const named = xmls.find((n) => /info.?table|infotable|form13fInfoTable/i.test(n));
  if (named) return named;
  // Exclude the primary cover (often "primary_doc.xml" or "*_doc.xml" / header).
  const nonCover = xmls.filter((n) => !/primary.?doc|primarydoc|header|^xslForm/i.test(n));
  return nonCover[0] ?? xmls[0] ?? null;
}

// ───────────────────────── information table XML → entries ─────────────────────────

import { XMLParser } from "fast-xml-parser";

// removeNSPrefix strips the ns1:/n1: prefixes filers sprinkle on; parseTagValue
// off keeps CUSIPs as strings (leading zeros / letters must survive — Number()
// would corrupt "037833100"). We coerce value/shares numerically ourselves.
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

export interface InfoTableEntry {
  nameOfIssuer: string;
  titleOfClass: string;
  cusip: string;
  /** Raw `value` as filed — thousands of $ before 2023-01-03, whole $ after. */
  value: number;
  shares: number;
  /** "SH" (shares) | "PRN" (principal). */
  sshPrnamtType: string;
  /** "Put" | "Call" | "" for a plain long share position. */
  putCall: string;
}

const asArray = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x: unknown): string => (x == null ? "" : String(x).trim());
const num = (x: unknown): number => {
  const n = Number(str(x).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pure: parse a 13F information-table XML into raw entries (one per filed row,
 * not yet aggregated or value-normalized). Tolerates namespace prefixes and a
 * single-row table (fast-xml-parser yields an object, not an array, for one row).
 */
export function parseInfoTable(xml: string): InfoTableEntry[] {
  const doc = parser.parse(xml) as Record<string, unknown> | null;
  const table = (doc?.informationTable ?? doc?.infoTable ?? doc) as Record<string, unknown> | null;
  const rows = asArray((table?.infoTable ?? table) as unknown) as Record<string, unknown>[];
  const out: InfoTableEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue; // tolerate null/empty parsed tags
    const cusip = str(row.cusip);
    if (!cusip) continue; // not an info-table row
    const amt = (row.shrsOrPrnAmt ?? {}) as Record<string, unknown>;
    out.push({
      nameOfIssuer: str(row.nameOfIssuer),
      titleOfClass: str(row.titleOfClass),
      cusip: cusip.toUpperCase(),
      value: num(row.value),
      shares: num(amt.sshPrnamt),
      sshPrnamtType: str(amt.sshPrnamtType) || "SH",
      putCall: str(row.putCall),
    });
  }
  return out;
}

// ───────────────────────── value normalization + aggregation ─────────────────────────

/**
 * SEC amended Form 13F so that for filings made on or after 2023-01-03 the
 * `value` column is reported in **whole dollars**; earlier filings reported it in
 * **thousands**. Normalize to whole dollars by filing date (a 1000× error if
 * skipped).
 */
const DOLLARS_CUTOFF = "2023-01-03";
export function normalizeValue(rawValue: number, filingDate: string): number {
  return filingDate && filingDate < DOLLARS_CUTOFF ? rawValue * 1000 : rawValue;
}

export interface Holding13F {
  cusip: string;
  issuerName: string;
  titleOfClass: string;
  /** Whole dollars (normalized). */
  value: number;
  shares: number;
  /** "Put" | "Call" | "" — a manager may hold shares AND options on one CUSIP. */
  putCall: string;
}

/**
 * Pure: collapse raw info-table entries into one holding per (cusip, putCall),
 * summing value and shares and normalizing value to whole dollars by filing
 * date. Same-CUSIP rows (multiple lots / discretion buckets) merge; a put and a
 * share line on the same issuer stay distinct (different putCall key).
 */
export function aggregateHoldings(entries: InfoTableEntry[], filingDate: string): Holding13F[] {
  const byKey = new Map<string, Holding13F>();
  for (const e of entries) {
    const key = `${e.cusip}|${e.putCall}`;
    const value = normalizeValue(e.value, filingDate);
    const prev = byKey.get(key);
    if (prev) {
      prev.value += value;
      prev.shares += e.shares;
    } else {
      byKey.set(key, {
        cusip: e.cusip,
        issuerName: e.nameOfIssuer,
        titleOfClass: e.titleOfClass,
        value,
        shares: e.shares,
        putCall: e.putCall,
      });
    }
  }
  // Largest position first — the natural display order.
  return [...byKey.values()].sort((a, b) => b.value - a.value);
}

// ───────────────────────── quarter-over-quarter diff ─────────────────────────

export type HoldingChange = "new" | "added" | "trimmed" | "exited" | "held";

export interface HoldingDelta {
  cusip: string;
  putCall: string;
  issuerName: string;
  change: HoldingChange;
  shares: number; // current quarter shares (0 if exited)
  prevShares: number;
  value: number; // current quarter value (0 if exited)
}

/**
 * Pure: classify each position's quarter-over-quarter change. Keyed by
 * (cusip, putCall) so puts and shares diff independently. Exited names (present
 * last quarter, gone this quarter) are included with `change: "exited"`.
 */
export function diffHoldings(curr: Holding13F[], prev: Holding13F[]): HoldingDelta[] {
  const keyOf = (h: Holding13F): string => `${h.cusip}|${h.putCall}`;
  const prevByKey = new Map(prev.map((h) => [keyOf(h), h]));
  const out: HoldingDelta[] = [];
  for (const c of curr) {
    const p = prevByKey.get(keyOf(c));
    const prevShares = p?.shares ?? 0;
    let change: HoldingChange;
    if (!p) change = "new";
    else if (c.shares > prevShares) change = "added";
    else if (c.shares < prevShares) change = "trimmed";
    else change = "held";
    out.push({ cusip: c.cusip, putCall: c.putCall, issuerName: c.issuerName, change, shares: c.shares, prevShares, value: c.value });
  }
  const currKeys = new Set(curr.map(keyOf));
  for (const p of prev) {
    if (currKeys.has(keyOf(p))) continue;
    out.push({ cusip: p.cusip, putCall: p.putCall, issuerName: p.issuerName, change: "exited", shares: 0, prevShares: p.shares, value: 0 });
  }
  return out;
}

// ───────────────────────── client ─────────────────────────

export async function fetchSubmissions(cik: number): Promise<Submissions | null> {
  return secGet<Submissions>(`${SEC_DATA_BASE}/submissions/CIK${padCik(cik)}.json`);
}

async function fetchFilingIndex(cik: number, accn: string): Promise<FilingIndex | null> {
  return secGet<FilingIndex>(`${SEC_WWW_BASE}/Archives/edgar/data/${cik}/${accnNoDashes(accn)}/index.json`);
}

async function fetchInfoTableXml(cik: number, accn: string, doc: string): Promise<string | null> {
  return secGet<string>(`${SEC_WWW_BASE}/Archives/edgar/data/${cik}/${accnNoDashes(accn)}/${doc}`, "application/xml");
}

export interface Quarter13F {
  reportDate: string;
  filingDate: string;
  accessionNumber: string;
  holdings: Holding13F[];
}

/** Fetch + parse one 13F filing's holdings (aggregated, value-normalized). */
export async function fetch13FHoldings(cik: number, filing: Filing13F): Promise<Holding13F[] | null> {
  const index = await fetchFilingIndex(cik, filing.accessionNumber);
  if (!index) return null;
  const doc = pickInfoTableDoc(index);
  if (!doc) return null;
  const xml = await fetchInfoTableXml(cik, filing.accessionNumber, doc);
  if (!xml) return null;
  return aggregateHoldings(parseInfoTable(xml), filing.filingDate);
}

/**
 * Resolve CIK → the most recent `quarters` 13F filings, each with parsed
 * holdings. Newest period first. Null when the CIK isn't a 13F filer / has no
 * filings; individual quarters that fail to parse are skipped (best-effort).
 */
export async function fetchLatest13F(cik: number, quarters = 2): Promise<Quarter13F[] | null> {
  const subs = await fetchSubmissions(cik);
  if (!subs) return null;
  const filings = latestPerPeriod(find13FFilings(subs)).slice(0, quarters);
  if (filings.length === 0) return null;
  const out: Quarter13F[] = [];
  for (const f of filings) {
    const holdings = await fetch13FHoldings(cik, f);
    if (holdings) out.push({ reportDate: f.reportDate, filingDate: f.filingDate, accessionNumber: f.accessionNumber, holdings });
  }
  return out;
}
