/**
 * Memo storage (data_memos + data_memo_symbols) — the per-user investment-memo layer.
 * The narrative is authored by the user's OWN Claude (MCP `submit_memo`) or a light web
 * compose, and posted here (T12: web/MCP forward, data owns the write). data stores it
 * and runs no LLM — but it DOES compute the point-in-time (PIT) snapshot for each attached
 * symbol SERVER-SIDE (price / reference valuation / the user's position), so the anchor is
 * authoritative and can't be spoofed by the caller (same rule as paper fill prices).
 *
 * Reads live in `@qt/shared/memo-read` (shared with web). This module owns the writes.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, dbSchema, codeVersion, marketdata } from "@qt/shared";
import { getLatestValuation } from "@qt/shared/research";
import { listMemos, getMemo, type MemoRow } from "@qt/shared/memo-read";

const { memos, memoSymbols, paperPositions, holdingsPositions } = dbSchema;

export const MEMO_TYPES = ["thesis", "review", "weekly", "research", "reflection", "note", "morning_call"] as const;
export const MEMO_DIRECTIONS = ["long", "short", "neutral"] as const;
export const MEMO_STATUSES = ["active", "closed", "archived"] as const;

/** Validate a memo type (defaults to `note` when absent; throws on an unknown value). */
export function normalizeMemoType(t: unknown): (typeof MEMO_TYPES)[number] {
  if (t == null || t === "") return "note";
  const s = String(t).toLowerCase();
  if ((MEMO_TYPES as readonly string[]).includes(s)) return s as (typeof MEMO_TYPES)[number];
  throw new Error(`invalid memo type: ${s} (expected one of ${MEMO_TYPES.join(", ")})`);
}

/** Validate an optional direction (absent → null; throws on an unknown value). */
export function normalizeDirection(d: unknown): (typeof MEMO_DIRECTIONS)[number] | null {
  if (d == null || d === "") return null;
  const s = String(d).toLowerCase();
  if ((MEMO_DIRECTIONS as readonly string[]).includes(s)) return s as (typeof MEMO_DIRECTIONS)[number];
  throw new Error(`invalid direction: ${s} (expected one of ${MEMO_DIRECTIONS.join(", ")})`);
}

/** Validate a status (absent → `active`; throws on an unknown value). */
export function normalizeStatus(s: unknown): (typeof MEMO_STATUSES)[number] {
  if (s == null || s === "") return "active";
  const v = String(s).toLowerCase();
  if ((MEMO_STATUSES as readonly string[]).includes(v)) return v as (typeof MEMO_STATUSES)[number];
  throw new Error(`invalid status: ${v} (expected one of ${MEMO_STATUSES.join(", ")})`);
}

/** Dedup + uppercase a symbol list (drops blanks). */
export function normalizeSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const x of input) {
    const s = String(x ?? "").trim().toUpperCase();
    if (s) seen.add(s);
  }
  return [...seen];
}

interface PositionSnap {
  paper: { qty: number; avgCost: number } | null;
  live: { qty: number; avgCost: number | null; markPrice: number | null } | null;
}

export interface PitSnapshot {
  symbol: string;
  priceAtWrite: number | null;
  priceTs: Date | null;
  valuationSnapshotId: string | null;
  context: { fairValue: number | null; upsidePct: number | null; verdict: string | null; position: PositionSnap };
}

/** The user's equity position in `symbol` at write time — paper (per-user ledger) + the
 *  latest live IBKR holding. A cross-domain READ of the portfolio tables (allowed: T12
 *  restricts writes, not reads). Both null when the user holds none / has no live account. */
async function readPosition(userId: string, symbol: string): Promise<PositionSnap> {
  const [paperRow] = await db()
    .select({ qty: paperPositions.quantity, avgCost: paperPositions.avgCost })
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.symbol, symbol)))
    .limit(1);
  // Latest equity (optionType='') holding row for this account+symbol.
  const [liveRow] = await db()
    .select({ qty: holdingsPositions.quantity, avgPrice: holdingsPositions.avgPrice, markPrice: holdingsPositions.markPrice })
    .from(holdingsPositions)
    .where(and(eq(holdingsPositions.accountId, userId), eq(holdingsPositions.symbol, symbol), eq(holdingsPositions.optionType, "")))
    .orderBy(desc(holdingsPositions.asOfDate))
    .limit(1);
  return {
    paper: paperRow ? { qty: paperRow.qty, avgCost: paperRow.avgCost } : null,
    live: liveRow ? { qty: liveRow.qty, avgCost: liveRow.avgPrice, markPrice: liveRow.markPrice } : null,
  };
}

/** Capture the PIT snapshot for one symbol: live quote + latest reference valuation +
 *  the user's position. All best-effort — a missing source leaves that field null, never
 *  blocks the memo. */
async function capturePit(userId: string, symbol: string): Promise<PitSnapshot> {
  const [quote, valuation, position] = await Promise.all([
    marketdata.getLiveQuote(symbol).catch(() => null),
    getLatestValuation(db(), symbol).catch(() => null),
    readPosition(userId, symbol).catch(() => ({ paper: null, live: null })),
  ]);
  return {
    symbol,
    priceAtWrite: quote?.price ?? null,
    priceTs: quote?.quoteTs ?? quote?.fetchedAt ?? null,
    valuationSnapshotId: valuation?.snapshotId ?? null,
    context: {
      fairValue: valuation?.fairValuePerShare ?? null,
      upsidePct: valuation?.upsidePct ?? null,
      verdict: valuation?.verdict ?? null,
      position,
    },
  };
}

/** Insert memo_symbols rows for `symbols`, each with a freshly captured PIT snapshot. */
async function attachSymbols(memoId: string, userId: string, symbols: string[]): Promise<PitSnapshot[]> {
  if (symbols.length === 0) return [];
  const snaps = await Promise.all(symbols.map((s) => capturePit(userId, s)));
  await db()
    .insert(memoSymbols)
    .values(snaps.map((s) => ({ memoId, symbol: s.symbol, priceAtWrite: s.priceAtWrite, priceTs: s.priceTs, valuationSnapshotId: s.valuationSnapshotId, context: s.context })))
    .onConflictDoNothing({ target: [memoSymbols.memoId, memoSymbols.symbol] });
  return snaps;
}

export interface SubmitMemoInput {
  userId: string;
  type?: string;
  title: string;
  markdown: string;
  symbols?: unknown;
  direction?: unknown;
  status?: unknown;
  idempotencyKey?: string | null;
}

/** Create a memo (+ attach symbols with PIT snapshots). Idempotent on (userId, idempotencyKey):
 *  a retried submit returns the original memo unchanged. */
export async function submitMemo(input: SubmitMemoInput): Promise<MemoRow> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("userId is required");
  const title = (input.title ?? "").trim();
  if (!title) throw new Error("title is required");
  const markdown = input.markdown ?? "";
  if (!markdown.trim()) throw new Error("markdown is required");
  const type = normalizeMemoType(input.type);
  const direction = normalizeDirection(input.direction);
  const status = normalizeStatus(input.status);
  const symbols = normalizeSymbols(input.symbols);
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  // Idempotency replay: a retried submit with the same key returns the original memo.
  if (idempotencyKey) {
    const [prior] = await db().select({ id: memos.id }).from(memos).where(and(eq(memos.userId, userId), eq(memos.idempotencyKey, idempotencyKey))).limit(1);
    if (prior) {
      const existing = await getMemo(db(), userId, prior.id);
      if (existing) return existing;
    }
  }

  const [row] = await db()
    .insert(memos)
    .values({ userId, type, title, markdown, direction, status, idempotencyKey, codeVersion: codeVersion() })
    .returning({ id: memos.id });
  const id = row!.id;
  await attachSymbols(id, userId, symbols);
  const created = await getMemo(db(), userId, id);
  if (!created) throw new Error("memo vanished after insert"); // unreachable
  return created;
}

export interface UpdateMemoInput {
  userId: string;
  id: string;
  title?: string;
  markdown?: string;
  status?: unknown;
  direction?: unknown;
  pinned?: boolean;
  addSymbols?: unknown;
  removeSymbols?: unknown;
}

/** Edit a memo's scalar fields and add/remove symbol links. Existing symbols' PIT
 *  snapshots are NEVER re-captured (they record what was true when written); only newly
 *  added symbols snapshot at add-time. Scoped by userId. */
export async function updateMemo(input: UpdateMemoInput): Promise<MemoRow> {
  const userId = input.userId.trim();
  const id = (input.id ?? "").trim();
  if (!userId || !id) throw new Error("userId and id are required");

  const [owned] = await db().select({ id: memos.id }).from(memos).where(and(eq(memos.id, id), eq(memos.userId, userId))).limit(1);
  if (!owned) throw new Error("memo not found");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title != null) {
    const t = input.title.trim();
    if (!t) throw new Error("title cannot be empty");
    set.title = t;
  }
  if (input.markdown != null) {
    if (!input.markdown.trim()) throw new Error("markdown cannot be empty");
    set.markdown = input.markdown;
  }
  if (input.status != null) set.status = normalizeStatus(input.status);
  if (input.direction !== undefined) set.direction = normalizeDirection(input.direction);
  if (input.pinned != null) set.pinned = !!input.pinned;
  await db().update(memos).set(set).where(and(eq(memos.id, id), eq(memos.userId, userId)));

  const remove = normalizeSymbols(input.removeSymbols);
  for (const s of remove) {
    await db().delete(memoSymbols).where(and(eq(memoSymbols.memoId, id), eq(memoSymbols.symbol, s)));
  }
  const add = normalizeSymbols(input.addSymbols);
  if (add.length) await attachSymbols(id, userId, add);

  const updated = await getMemo(db(), userId, id);
  if (!updated) throw new Error("memo not found");
  return updated;
}

/** Delete a memo (cascade removes its symbol links). Scoped by userId. */
export async function deleteMemo(userId: string, id: string): Promise<{ deleted: boolean }> {
  const uid = userId.trim();
  const mid = (id ?? "").trim();
  if (!uid || !mid) throw new Error("userId and id are required");
  const res = await db().delete(memos).where(and(eq(memos.id, mid), eq(memos.userId, uid))).returning({ id: memos.id });
  return { deleted: res.length > 0 };
}

// Re-export the shared reads so the data service has one import site for memos.
export { listMemos, getMemo };
