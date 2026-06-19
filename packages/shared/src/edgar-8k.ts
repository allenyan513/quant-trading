/**
 * SEC Form 8-K (current report) client + parsers — the free, official source for a
 * company's material events. Unlike news, 8-Ks are structured: the item codes
 * (2.02 earnings, 5.02 leadership, 1.03 bankruptcy, …) come straight from the
 * submissions feed's `items` field, so NO document parsing is needed.
 *
 * Flow (all SEC, no key):
 *   files/company_tickers.json        → ticker → CIK (for the ingest universe)
 *   submissions/CIK{cik}.json         → form=8-K rows: accession, dates, items, doc
 *
 * Pure parsers (unit-tested) + thin client, no DB — mirrors thirteenf.ts. The
 * alpha-feed (8-K → data_events → repricing, #103 part 2) is a separate follow-up;
 * this module is the symbol-centric foundation. Honest limit: item codes describe
 * WHAT happened, not the detail (that's in the unparsed doc / left to a follow-up).
 */
import { secGet } from "./sec-http.js";
import { fetchSubmissions, type Submissions } from "./thirteenf.js";

export type { Submissions } from "./thirteenf.js";

// ───────────────────────── 8-K item-code taxonomy ─────────────────────────

/** Materiality bucket for display + (future) playbook routing. */
export type ItemCategory = "high" | "material" | "routine";

interface ItemDef {
  label: string;
  category: ItemCategory;
}

// The standard Form 8-K items. `high` = market-moving / distress (bankruptcy,
// delisting, restatement, control change, cyber); `material` = earnings, M&A,
// leadership, agreements, obligations; `routine` = exhibits, Reg FD, votes, admin.
export const ITEM_CODES: Record<string, ItemDef> = {
  "1.01": { label: "Entry into a Material Agreement", category: "material" },
  "1.02": { label: "Termination of a Material Agreement", category: "material" },
  "1.03": { label: "Bankruptcy or Receivership", category: "high" },
  "1.04": { label: "Mine Safety", category: "routine" },
  "1.05": { label: "Material Cybersecurity Incident", category: "high" },
  "2.01": { label: "Completion of Acquisition/Disposition", category: "material" },
  "2.02": { label: "Results of Operations (Earnings)", category: "material" },
  "2.03": { label: "Creation of a Direct Financial Obligation", category: "material" },
  "2.04": { label: "Triggering Event Accelerating an Obligation", category: "material" },
  "2.05": { label: "Costs of Exit or Disposal", category: "material" },
  "2.06": { label: "Material Impairments", category: "material" },
  "3.01": { label: "Notice of Delisting", category: "high" },
  "3.02": { label: "Unregistered Sale of Equity", category: "material" },
  "3.03": { label: "Modification to Security-Holder Rights", category: "material" },
  "4.01": { label: "Change in Certifying Accountant", category: "material" },
  "4.02": { label: "Non-Reliance on Prior Financials (Restatement)", category: "high" },
  "5.01": { label: "Change in Control", category: "high" },
  "5.02": { label: "Departure/Election of Directors or Officers", category: "material" },
  "5.03": { label: "Amendment to Articles/Bylaws", category: "routine" },
  "5.04": { label: "Suspension of Trading Under Benefit Plans", category: "routine" },
  "5.05": { label: "Amendment to Code of Ethics", category: "routine" },
  "5.06": { label: "Change in Shell Company Status", category: "material" },
  "5.07": { label: "Submission of Matters to a Shareholder Vote", category: "routine" },
  "5.08": { label: "Shareholder Director Nominations", category: "routine" },
  "7.01": { label: "Regulation FD Disclosure", category: "routine" },
  "8.01": { label: "Other Events", category: "routine" },
  "9.01": { label: "Financial Statements and Exhibits", category: "routine" },
};

export interface DecodedItem {
  code: string;
  label: string;
  category: ItemCategory;
}

const CATEGORY_RANK: Record<ItemCategory, number> = { high: 0, material: 1, routine: 2 };

/** Pure: decode a raw item CSV ("2.02,9.01") to labelled items, most-material first.
 *  Unknown codes (new SEC items) pass through with a generic label + routine. */
export function decodeItems(csv: string): DecodedItem[] {
  return (csv ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((code) => {
      const def = ITEM_CODES[code];
      return def ? { code, ...def } : { code, label: `Item ${code}`, category: "routine" as ItemCategory };
    })
    .sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]);
}

/** Pure: the filing's overall category = its most-material item. */
export function filingCategory(csv: string): ItemCategory {
  const items = decodeItems(csv);
  return items[0]?.category ?? "routine";
}

// ───────────────────────── submissions → 8-K filings ─────────────────────────

export interface EightKFiling {
  accessionNumber: string;
  filedDate: string; // YYYY-MM-DD
  reportDate: string | null; // event date (8-K cover); often present
  acceptedAt: string | null; // acceptanceDateTime — PIT (when it went public)
  items: string; // raw CSV
  primaryDocument: string;
}

/** Pure: pluck all 8-K (and 8-K/A) filings from a submissions payload, newest filed
 *  first. Skips rows with no filing date (would break known_at). */
export function find8KFilings(subs: Submissions): EightKFiling[] {
  const r = subs.filings?.recent;
  if (!r?.form || !r.accessionNumber) return [];
  const out: EightKFiling[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (form !== "8-K" && form !== "8-K/A") continue;
    const accessionNumber = r.accessionNumber[i];
    const filedDate = r.filingDate?.[i] ?? "";
    if (!accessionNumber || !filedDate) continue;
    out.push({
      accessionNumber,
      filedDate,
      reportDate: r.reportDate?.[i] || null,
      acceptedAt: r.acceptanceDateTime?.[i] || null,
      items: r.items?.[i] ?? "",
      primaryDocument: r.primaryDocument?.[i] ?? "",
    });
  }
  return out.sort((a, b) => b.filedDate.localeCompare(a.filedDate));
}

// ───────────────────────── client ─────────────────────────

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/** Fetch SEC's official ticker → CIK directory (one ~1MB JSON, ~10k companies).
 *  Returns Map<TICKER, { cik (10-digit), name }>. */
export async function fetchCompanyTickers(): Promise<Map<string, { cik: string; name: string }>> {
  const raw = await secGet<Record<string, CompanyTickerEntry>>("https://www.sec.gov/files/company_tickers.json");
  const map = new Map<string, { cik: string; name: string }>();
  if (!raw) return map;
  for (const e of Object.values(raw)) {
    if (!e?.ticker || e.cik_str == null) continue;
    map.set(e.ticker.toUpperCase(), { cik: String(e.cik_str).padStart(10, "0"), name: e.title ?? "" });
  }
  return map;
}

/** Resolve one symbol's recent 8-K filings via its CIK. `cik` is numeric (un-padded). */
export async function fetch8KFilings(cik: number): Promise<EightKFiling[] | null> {
  const subs = await fetchSubmissions(cik);
  if (!subs) return null;
  return find8KFilings(subs);
}
