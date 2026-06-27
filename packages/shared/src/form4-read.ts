/**
 * Insider read queries — the symbol-centric insider-transaction view, shared by the
 * SPA dashboard (Ownership tab) and the MCP get_symbol_research ownership section.
 * Source is SEC Form 4 (`data_form4`, rich: transaction code + 10b5-1 + derivative);
 * the legacy FMP cache was retired (#132), so `source` is "sec" or "none". The
 * Drizzle db is injected (gateway = neon-http, data = pg Pool). All read-only.
 */
import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { form4Transactions } from "./db/schema.js";
import { decodeCode, type Signal } from "./form4.js";

export type ReadDb = PgDatabase<any, any, any>;

export interface InsiderTxn {
  reportingName: string;
  relationship: string | null;
  officerTitle: string | null;
  code: string | null;
  codeLabel: string | null;
  signal: Signal;
  acquiredDisposed: string | null; // "A" | "D"
  shares: number | null;
  price: number | null;
  value: number | null; // shares × price
  securityTitle: string | null;
  isDerivative: boolean;
  is10b5_1: boolean;
  date: string | null; // transaction date (preferred) or filing date
}

export interface InsidersForSymbol {
  symbol: string;
  source: "sec" | "none";
  insiders: InsiderTxn[];
}

const mul = (a: number | null, b: number | null): number | null => (a != null && b != null ? a * b : null);

export interface SecRow {
  reportingName: string;
  relationship: string | null;
  officerTitle: string | null;
  transactionCode: string;
  acquiredDisposed: string | null;
  shares: number | null;
  pricePerShare: number | null;
  securityTitle: string | null;
  isDerivative: boolean;
  is10b5_1: boolean;
  transactionDate: string | null;
  filedDate: string;
}

/** Pure: shape a SEC `data_form4` row → InsiderTxn (decode the transaction code). */
export function shapeSecTxn(r: SecRow): InsiderTxn {
  const d = decodeCode(r.transactionCode);
  return {
    reportingName: r.reportingName,
    relationship: r.relationship,
    officerTitle: r.officerTitle,
    code: d.code,
    codeLabel: d.label,
    signal: d.signal,
    acquiredDisposed: r.acquiredDisposed,
    shares: r.shares,
    price: r.pricePerShare,
    value: mul(r.shares, r.pricePerShare),
    securityTitle: r.securityTitle,
    isDerivative: r.isDerivative,
    is10b5_1: r.is10b5_1,
    date: r.transactionDate ?? r.filedDate,
  };
}

/** A symbol's recent insider transactions from SEC Form 4 (`data_form4`). */
export async function getInsidersForSymbol(db: ReadDb, symbol: string, limit = 40): Promise<InsidersForSymbol> {
  const sym = symbol.trim().toUpperCase();

  const sec = await db
    .select({
      reportingName: form4Transactions.reportingName,
      relationship: form4Transactions.relationship,
      officerTitle: form4Transactions.officerTitle,
      transactionCode: form4Transactions.transactionCode,
      acquiredDisposed: form4Transactions.acquiredDisposed,
      shares: form4Transactions.shares,
      pricePerShare: form4Transactions.pricePerShare,
      securityTitle: form4Transactions.securityTitle,
      isDerivative: form4Transactions.isDerivative,
      is10b5_1: form4Transactions.is10b5_1,
      transactionDate: form4Transactions.transactionDate,
      filedDate: form4Transactions.filedDate,
    })
    .from(form4Transactions)
    .where(eq(form4Transactions.symbol, sym))
    .orderBy(desc(form4Transactions.filedDate), desc(form4Transactions.knownAt))
    .limit(limit);
  if (sec.length) return { symbol: sym, source: "sec", insiders: sec.map(shapeSecTxn) };

  return { symbol: sym, source: "none", insiders: [] };
}
