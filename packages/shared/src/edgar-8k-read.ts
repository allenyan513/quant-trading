/**
 * 8-K read queries — the symbol-centric material-events view, shared by the web
 * dashboard (Events tab) and the MCP `get_symbol_research` events section so both
 * serve identical shapes from one source. The Drizzle db is injected (web = neon-http,
 * data = pg Pool), driver-agnostic. All read-only.
 */
import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { eightKFilings } from "./db/schema.js";
import { decodeItems, type DecodedItem, type ItemCategory } from "./edgar-8k.js";

export type ReadDb = PgDatabase<any, any, any>;

const EDGAR_ARCHIVE = "https://www.sec.gov/Archives/edgar/data";

export interface EightKRow {
  accessionNumber: string;
  cik: string;
  filedDate: string;
  reportDate: string | null;
  items: string;
  primaryDocument: string | null;
}

export interface EightKEvent {
  accessionNumber: string;
  filedDate: string;
  reportDate: string | null;
  /** Overall materiality = the most-material item's category. */
  category: ItemCategory;
  items: DecodedItem[];
  /** Deep link to the filing's primary document on EDGAR (null if unknown). */
  filingUrl: string | null;
}

/** Pure: decode a stored 8-K row into a display/LLM-ready event. */
export function shape8K(row: EightKRow): EightKEvent {
  const items = decodeItems(row.items);
  const filingUrl =
    row.primaryDocument && row.cik
      ? `${EDGAR_ARCHIVE}/${Number(row.cik)}/${row.accessionNumber.replace(/-/g, "")}/${row.primaryDocument}`
      : null;
  return {
    accessionNumber: row.accessionNumber,
    filedDate: row.filedDate,
    reportDate: row.reportDate,
    category: items[0]?.category ?? "routine",
    items,
    filingUrl,
  };
}

export interface EightKForSymbol {
  symbol: string;
  events: EightKEvent[];
}

/** A symbol's recent 8-K material events, newest filed first. */
export async function get8KForSymbol(db: ReadDb, symbol: string, limit = 40): Promise<EightKForSymbol> {
  const sym = symbol.trim().toUpperCase();
  const rows = await db
    .select({
      accessionNumber: eightKFilings.accessionNumber,
      cik: eightKFilings.cik,
      filedDate: eightKFilings.filedDate,
      reportDate: eightKFilings.reportDate,
      items: eightKFilings.items,
      primaryDocument: eightKFilings.primaryDocument,
    })
    .from(eightKFilings)
    .where(eq(eightKFilings.symbol, sym))
    .orderBy(desc(eightKFilings.filedDate))
    .limit(limit);
  return { symbol: sym, events: rows.map(shape8K) };
}
