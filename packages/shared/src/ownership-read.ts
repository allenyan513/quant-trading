/**
 * Ownership read queries — the symbol-centric SEC ownership view, shared by the web
 * dashboard (Ownership tab) and the MCP `get_symbol_research` ownership section so
 * both serve identical shapes from one source. The Drizzle db is injected (gateway =
 * neon-http, data = pg Pool), so builders are driver-agnostic. All read-only.
 *
 * Two parts:
 *  - filings    — this symbol's SC 13D/13G beneficial-ownership filings (the new
 *                 data_ownership_filings table), latest per (filer, schedule).
 *  - legendHolders — which tracked 13F managers hold this symbol (a REVERSE query
 *                 over the existing data_13f_holdings; zero new ingest).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { ownershipFilings, ownershipFilers, thirteenFFilers, thirteenFHoldings, thirteenFCusipMap } from "./db/schema.js";

export type ReadDb = PgDatabase<any, any, any>;

// ───────────────────────── 13D/13G filings (pure shaping) ─────────────────────────

export interface FilingRecord {
  accessionNumber: string;
  filerCik: string;
  filerName: string;
  filerLabel: string | null;
  formType: string;
  schedule: string; // "13D" | "13G"
  isAmendment: boolean;
  subjectName: string;
  subjectTicker: string | null;
  cusip: string | null;
  pctOfClass: number | null;
  sharesOwned: number | null;
  filedDate: string;
}

export interface OwnershipPosition extends FilingRecord {
  /** How many filings (original + amendments) this filer made on this subject+schedule. */
  amendmentCount: number;
  /** Earliest filed date in the group — when the position was first disclosed. */
  firstFiledDate: string;
}

/**
 * Pure: collapse raw filing rows to one CURRENT position per (filer, schedule) —
 * the latest-filed row, with amendmentCount + firstFiledDate from the group. Each
 * 13D/13G amendment is a separate filing; the newest restates the position. Sorted
 * 13D (activist) before 13G (passive), then newest filed first.
 */
export function selectCurrentPositions(rows: FilingRecord[]): OwnershipPosition[] {
  const groups = new Map<string, FilingRecord[]>();
  for (const r of rows) {
    const key = `${r.filerCik}|${r.schedule}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: OwnershipPosition[] = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => b.filedDate.localeCompare(a.filedDate));
    const current = sorted[0]!;
    out.push({ ...current, amendmentCount: g.length, firstFiledDate: sorted[sorted.length - 1]!.filedDate });
  }
  return out.sort((a, b) =>
    a.schedule === b.schedule ? b.filedDate.localeCompare(a.filedDate) : a.schedule === "13D" ? -1 : 1,
  );
}

// ───────────────────────── 13F reverse (legend holders, pure shaping) ─────────────────────────

export interface HoldingRecord {
  cik: string;
  filerName: string;
  filerLabel: string | null;
  quarter: string;
  shares: number;
  value: number;
}

/**
 * Pure: for each 13F filer, keep their LATEST quarter holding this symbol, summing
 * across share classes (multiple CUSIPs) within that quarter. Largest position
 * (value) first.
 */
export function latestPerFiler(rows: HoldingRecord[]): HoldingRecord[] {
  const maxQ = new Map<string, string>();
  for (const h of rows) {
    const q = maxQ.get(h.cik);
    if (!q || h.quarter > q) maxQ.set(h.cik, h.quarter);
  }
  const byCik = new Map<string, HoldingRecord>();
  for (const h of rows) {
    if (h.quarter !== maxQ.get(h.cik)) continue; // only the latest quarter per filer
    const prev = byCik.get(h.cik);
    if (prev) {
      prev.shares += h.shares;
      prev.value += h.value;
    } else byCik.set(h.cik, { ...h });
  }
  return [...byCik.values()].sort((a, b) => b.value - a.value);
}

// ───────────────────────── combined symbol query ─────────────────────────

export interface OwnershipForSymbol {
  symbol: string;
  filings: OwnershipPosition[];
  legendHolders: HoldingRecord[];
}

/** The full SEC ownership picture for a symbol: 13D/13G filings + 13F legend holders. */
export async function getOwnershipForSymbol(db: ReadDb, symbol: string): Promise<OwnershipForSymbol> {
  const sym = symbol.trim().toUpperCase();

  const [filingRows, legendHolders] = await Promise.all([
    // A. 13D/13G filings on this subject (subject_ticker is denormalized + indexed).
    db
      .select({
        accessionNumber: ownershipFilings.accessionNumber,
        filerCik: ownershipFilings.filerCik,
        filerName: ownershipFilings.filerName,
        filerLabel: ownershipFilers.label,
        formType: ownershipFilings.formType,
        schedule: ownershipFilings.schedule,
        isAmendment: ownershipFilings.isAmendment,
        subjectName: ownershipFilings.subjectName,
        subjectTicker: ownershipFilings.subjectTicker,
        cusip: ownershipFilings.cusip,
        pctOfClass: ownershipFilings.pctOfClass,
        sharesOwned: ownershipFilings.sharesOwned,
        filedDate: ownershipFilings.filedDate,
      })
      .from(ownershipFilings)
      .leftJoin(ownershipFilers, eq(ownershipFilers.cik, ownershipFilings.filerCik))
      .where(eq(ownershipFilings.subjectTicker, sym))
      .then(selectCurrentPositions),
    // B. 13F reverse: which tracked legends hold this symbol (ticker → cusips → holdings).
    legendHoldersForSymbol(db, sym),
  ]);

  return { symbol: sym, filings: filingRows, legendHolders };
}

async function legendHoldersForSymbol(db: ReadDb, sym: string): Promise<HoldingRecord[]> {
  const cusipRows = await db
    .select({ cusip: thirteenFCusipMap.cusip })
    .from(thirteenFCusipMap)
    .where(eq(thirteenFCusipMap.ticker, sym));
  const cusips = cusipRows.map((r) => r.cusip);
  if (cusips.length === 0) return []; // CUSIP not mapped yet → no legend holders surfaced

  const holds = await db
    .select({
      cik: thirteenFHoldings.cik,
      filerName: thirteenFFilers.name,
      filerLabel: thirteenFFilers.label,
      quarter: thirteenFHoldings.quarter,
      shares: thirteenFHoldings.shares,
      value: thirteenFHoldings.value,
    })
    .from(thirteenFHoldings)
    .innerJoin(thirteenFFilers, and(eq(thirteenFFilers.cik, thirteenFHoldings.cik), eq(thirteenFFilers.active, true)))
    .where(and(inArray(thirteenFHoldings.cusip, cusips), eq(thirteenFHoldings.putCall, "")));
  return latestPerFiler(holds);
}
