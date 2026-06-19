/**
 * Insider read queries — the symbol-centric insider-transaction view, shared by the
 * web dashboard (Ownership tab) and the MCP get_symbol_research ownership section.
 * SEC Form 4 (`data_form4`, rich: transaction code + 10b5-1 + derivative) is the
 * primary source; the legacy FMP cache (`data_insider`, P/S only, flattened) is a
 * read-time fallback for symbols SEC hasn't covered yet — tagged via `source`. The
 * Drizzle db is injected (web = neon-http, data = pg Pool). All read-only.
 */
import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { form4Transactions, insiderTrades } from "./db/schema.js";
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
  source: "sec" | "fmp" | "none";
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

/** Pure: shape a legacy FMP `data_insider` row (raw jsonb) → InsiderTxn. FMP keeps
 *  only P/S, has no code/10b5-1/derivative — derive code from `transactionType`. */
export function shapeFmpRow(data: Record<string, unknown>, observedAt: Date | string | null): InsiderTxn {
  const tt = typeof data.transactionType === "string" ? data.transactionType : "";
  const code = /^p/i.test(tt) ? "P" : /^s/i.test(tt) ? "S" : null;
  const d = code ? decodeCode(code) : { code: null, label: null, signal: "neutral" as Signal };
  const num = (k: string) => (typeof data[k] === "number" ? (data[k] as number) : null);
  const s = (k: string) => (typeof data[k] === "string" && data[k] ? (data[k] as string) : null);
  const shares = num("securitiesTransacted");
  const price = num("price");
  const obs = observedAt instanceof Date ? observedAt.toISOString().slice(0, 10) : typeof observedAt === "string" ? observedAt.slice(0, 10) : null;
  return {
    reportingName: s("reportingName") ?? "—",
    relationship: s("typeOfOwner"),
    officerTitle: null,
    code: d.code,
    codeLabel: d.label,
    signal: d.signal,
    acquiredDisposed: s("acquisitionOrDisposition"),
    shares,
    price,
    value: mul(shares, price),
    securityTitle: null,
    isDerivative: false,
    is10b5_1: false,
    date: s("transactionDate") ?? s("filingDate") ?? obs,
  };
}

/** A symbol's recent insider transactions — SEC Form 4 first, FMP fallback. */
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

  // Fallback: legacy FMP cache (until SEC coverage is verified, then retired).
  const fmp = await db
    .select({ observedAt: insiderTrades.observedAt, data: insiderTrades.data })
    .from(insiderTrades)
    .where(eq(insiderTrades.symbol, sym))
    .orderBy(desc(insiderTrades.observedAt))
    .limit(limit);
  if (fmp.length) return { symbol: sym, source: "fmp", insiders: fmp.map((r) => shapeFmpRow((r.data ?? {}) as Record<string, unknown>, r.observedAt)) };

  return { symbol: sym, source: "none", insiders: [] };
}
