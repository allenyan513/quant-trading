/**
 * Per-user memo reads — shared by the web dashboard and the OAuth MCP `get_memos`
 * tool so both serve an identical shape from one source. Driver-agnostic (injected
 * `PgDatabase`, like `paper-read.ts` / `research.ts`). Read-only.
 *
 * A memo is a free-form Markdown document (owned by the data service) linkable to
 * 0..N symbols; each link carries a point-in-time snapshot (price / valuation /
 * position) captured when the symbol was attached. List queries omit the markdown
 * body unless `includeBody` (web archive doesn't need it; MCP recall does). All
 * queries are scoped by `userId` — tenant isolation.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { memos, memoSymbols } from "./db/schema.js";

export type MemoDb = PgDatabase<any, any, any>;

/** A symbol attached to a memo + its captured PIT snapshot. */
export interface MemoSymbolRow {
  symbol: string;
  priceAtWrite: number | null;
  priceTs: Date | null;
  valuationSnapshotId: string | null;
  context: unknown; // { fairValue, upsidePct, verdict, position: { paper, live } }
  attachedAt: Date;
}

export interface MemoRow {
  id: string;
  type: string; // thesis | review | weekly | research | reflection | note | morning_call
  title: string;
  markdown: string | null; // null when listed without includeBody
  direction: string | null; // long | null
  status: string; // active | closed | archived
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  symbols: MemoSymbolRow[];
}

export interface ListMemosOpts {
  symbol?: string; // only memos linked to this ticker
  type?: string;
  status?: string;
  includeBody?: boolean; // include the markdown body (default false)
  limit?: number; // default 50, capped 200
}

const memoCols = (includeBody: boolean) => ({
  id: memos.id,
  type: memos.type,
  title: memos.title,
  // Omit the (potentially large) body from list queries via a SQL null literal.
  markdown: includeBody ? memos.markdown : sql<string | null>`null`,
  direction: memos.direction,
  status: memos.status,
  pinned: memos.pinned,
  createdAt: memos.createdAt,
  updatedAt: memos.updatedAt,
});

const SYMBOL_COLS = {
  memoId: memoSymbols.memoId,
  symbol: memoSymbols.symbol,
  priceAtWrite: memoSymbols.priceAtWrite,
  priceTs: memoSymbols.priceTs,
  valuationSnapshotId: memoSymbols.valuationSnapshotId,
  context: memoSymbols.context,
  attachedAt: memoSymbols.attachedAt,
} as const;

/** List a user's memos (newest first), optionally filtered by symbol / type / status.
 *  Each memo carries its attached symbols + PIT snapshots. */
export async function listMemos(db: MemoDb, userId: string, opts: ListMemosOpts = {}): Promise<MemoRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const includeBody = opts.includeBody ?? false;

  // When filtering by symbol, first resolve the memo ids linked to it (scoped via the
  // memo's owner below), so the symbol filter doesn't drop a memo's OTHER symbols.
  let idsForSymbol: string[] | null = null;
  if (opts.symbol) {
    const sym = opts.symbol.toUpperCase();
    const linked = await db.select({ memoId: memoSymbols.memoId }).from(memoSymbols).where(eq(memoSymbols.symbol, sym));
    idsForSymbol = linked.map((r) => r.memoId);
    if (idsForSymbol.length === 0) return [];
  }

  const conds = [eq(memos.userId, userId)];
  if (opts.type) conds.push(eq(memos.type, opts.type));
  if (opts.status) conds.push(eq(memos.status, opts.status));
  if (idsForSymbol) conds.push(inArray(memos.id, idsForSymbol));

  const rows = await db
    .select(memoCols(includeBody))
    .from(memos)
    .where(and(...conds))
    .orderBy(desc(memos.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const symRows = await db
    .select(SYMBOL_COLS)
    .from(memoSymbols)
    .where(inArray(memoSymbols.memoId, rows.map((r) => r.id)));
  const byMemo = groupSymbols(symRows);

  return rows.map((r) => ({ ...r, symbols: byMemo.get(r.id) ?? [] }));
}

/** A single memo (full body + symbols), or null if it isn't the user's. */
export async function getMemo(db: MemoDb, userId: string, id: string): Promise<MemoRow | null> {
  const [row] = await db
    .select(memoCols(true))
    .from(memos)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
    .limit(1);
  if (!row) return null;
  const symRows = await db.select(SYMBOL_COLS).from(memoSymbols).where(eq(memoSymbols.memoId, id));
  return { ...row, symbols: groupSymbols(symRows).get(id) ?? [] };
}

type SymbolSelectRow = { memoId: string } & MemoSymbolRow;

/** Group attached-symbol rows by memo id (symbols sorted for stable display). */
function groupSymbols(rows: SymbolSelectRow[]): Map<string, MemoSymbolRow[]> {
  const out = new Map<string, MemoSymbolRow[]>();
  for (const r of rows) {
    const list = out.get(r.memoId) ?? [];
    list.push({ symbol: r.symbol, priceAtWrite: r.priceAtWrite, priceTs: r.priceTs, valuationSnapshotId: r.valuationSnapshotId, context: r.context, attachedAt: r.attachedAt });
    out.set(r.memoId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}
