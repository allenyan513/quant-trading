/**
 * EDGAR full-text search (efts.sec.gov) — keyword / quoted-phrase search across the
 * full text of every EDGAR filing since 2001. Unlike the other SEC modules this is a
 * LIVE passthrough: results aren't ingested into a table. Per the "data is the sole
 * external-data receiver" rule, only data calls searchFilings (exposed at
 * POST /edgar/search); web's MCP search_filings tool HTTP-forwards there. The pure
 * shapers (parseDisplayName / shapeHit / buildSearchUrl) are unit-tested; only
 * searchFilings does I/O (via the shared secGet throttle).
 */
import { secGet } from "./sec-http.js";

const EFTS_URL = "https://efts.sec.gov/LATEST/search-index";
const SEC_WWW = "https://www.sec.gov";

export interface FtsHit {
  accession: string;
  form: string;
  filedDate: string; // YYYY-MM-DD
  company: string;
  ticker: string | null;
  cik: string | null;
  items: string[]; // 8-K item codes when present
  fileType: string | null;
  url: string; // direct link to the matched document
}

export interface FtsResult {
  query: string;
  total: number; // total matches across all pages (results is capped to `limit`)
  results: FtsHit[];
}

export interface SearchOpts {
  forms?: string[]; // restrict to these form types, e.g. ["8-K"], ["10-K","10-Q"]
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  limit?: number; // max results returned (1..100, default 20)
}

interface EftsResponse {
  hits?: {
    total?: { value?: number };
    hits?: Array<{ _id?: string; _source?: Record<string, unknown> }>;
  };
}

const accnNoDashes = (a: string): string => a.replace(/-/g, "");
const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const asStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Pure: parse a display_names entry "Company Name  (TICK)  (CIK 0000…)" into parts.
 *  Ticker is optional (many filers — funds, individuals — have none); CIK is reliable. */
export function parseDisplayName(s: string): { company: string; ticker: string | null; cik: string | null } {
  const cik = s.match(/\(CIK\s+(\d+)\)/)?.[1] ?? null;
  const head = s.replace(/\s*\(CIK\s+\d+\)\s*$/, "").trim(); // drop the trailing "(CIK …)"
  // a trailing "(TICKER)" or "(TICK1, TICK2)" (dual-class / warrants) — take the first.
  const tm = head.match(/\(([A-Z][A-Z0-9.\-]*)(?:,\s*[A-Z][A-Z0-9.\-]*)*\)\s*$/);
  const ticker = tm?.[1] ?? null;
  const company = (tm?.index != null ? head.slice(0, tm.index) : head).trim();
  return { company, ticker, cik };
}

/** Pure: shape one efts hit → FtsHit (null if it lacks an accession). */
export function shapeHit(hit: { _id?: string; _source?: Record<string, unknown> }): FtsHit | null {
  const src = hit._source ?? {};
  const accession = asStr(src.adsh);
  if (!accession) return null;
  const id = hit._id ?? "";
  const filename = id.includes(":") ? id.slice(id.indexOf(":") + 1) : "";
  const names = asStrArr(src.display_names);
  const dn = names[0] ? parseDisplayName(names[0]) : { company: "", ticker: null, cik: null };
  const cik = dn.cik ?? asStrArr(src.ciks)[0] ?? null;
  const cikNum = cik ? String(Number(cik)) : null; // un-padded for the Archives path
  return {
    accession,
    form: asStr(src.form) ?? "",
    filedDate: asStr(src.file_date) ?? "",
    company: dn.company,
    ticker: dn.ticker,
    cik,
    items: asStrArr(src.items),
    fileType: asStr(src.file_type),
    url:
      cikNum && filename
        ? `${SEC_WWW}/Archives/edgar/data/${cikNum}/${accnNoDashes(accession)}/${filename}`
        : `${SEC_WWW}/Archives/edgar/data/${cikNum ?? ""}/${accnNoDashes(accession)}/`,
  };
}

/** Pure: build the efts search URL from a query + options. */
export function buildSearchUrl(query: string, opts: SearchOpts = {}): string {
  const p = new URLSearchParams();
  p.set("q", query);
  if (opts.forms?.length) p.set("forms", opts.forms.join(","));
  if (opts.startDate && opts.endDate) {
    p.set("dateRange", "custom");
    p.set("startdt", opts.startDate);
    p.set("enddt", opts.endDate);
  }
  return `${EFTS_URL}?${p.toString()}`;
}

/** Search EDGAR full text (live). Returns shaped hits (capped to `limit`) + the
 *  total match count. Empty query → empty result (no network call). */
export async function searchFilings(query: string, opts: SearchOpts = {}): Promise<FtsResult> {
  const q = query.trim();
  if (!q) return { query: q, total: 0, results: [] };
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 100);
  const res = await secGet<EftsResponse>(buildSearchUrl(q, opts));
  const hits = res?.hits?.hits ?? [];
  const total = res?.hits?.total?.value ?? 0;
  const results = hits.map(shapeHit).filter((h): h is FtsHit => h !== null).slice(0, limit);
  return { query: q, total, results };
}
