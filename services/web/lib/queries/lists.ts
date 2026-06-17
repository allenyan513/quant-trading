/**
 * Read queries: the generic dashboard list feeds (events, notifications, news,
 * signals, positions, valuations, candidates). All read-only, Node runtime only.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  events,
  notifications,
  newsItems,
  tradingSignals,
  signalDeliveries,
  positions,
  valuationSnapshots,
  candidates,
} from "../db.js";

interface ListOpts {
  limit?: number;
  offset?: number;
  symbol?: string;
  status?: string;
  deliveryStatus?: string;
  eventType?: string;
  category?: string;
  priority?: string; // news triage priority: low | med | high
}

export async function listEvents(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(events.symbol, opts.symbol));
  if (opts.deliveryStatus) conds.push(eq(events.deliveryStatus, opts.deliveryStatus));
  if (opts.eventType) conds.push(eq(events.eventType, opts.eventType));
  return db()
    .select()
    .from(events)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(events.ingestedAt))
    .limit(limit);
}

export async function listNotifications(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(notifications.symbol, opts.symbol));
  if (opts.status) conds.push(eq(notifications.status, opts.status));
  if (opts.deliveryStatus) conds.push(eq(notifications.deliveryStatus, opts.deliveryStatus));
  if (opts.eventType) conds.push(eq(notifications.eventType, opts.eventType));
  return db()
    .select()
    .from(notifications)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(notifications.ingestedAt))
    .limit(limit);
}

/** Staged FMP news for the manual flow (issue #59), newest published first. */
export async function listNews(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(newsItems.symbol, opts.symbol));
  if (opts.status) conds.push(eq(newsItems.status, opts.status));
  if (opts.category) conds.push(eq(newsItems.category, opts.category));
  if (opts.priority) conds.push(eq(newsItems.triagePriority, opts.priority));
  return db()
    .select()
    .from(newsItems)
    .where(conds.length ? and(...conds) : undefined)
    // published_at DESC, but NULLS LAST (Postgres defaults DESC -> NULLS FIRST,
    // which floats undated rows above real news). pulled_at breaks ties so freshly
    // pulled rows sort sensibly when publish times collide / are missing.
    .orderBy(sql`${newsItems.publishedAt} desc nulls last`, desc(newsItems.pulledAt))
    .limit(limit)
    .offset(opts.offset ?? 0);
}

export async function listSignals(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(tradingSignals.symbol, opts.symbol));
  if (opts.status) conds.push(eq(tradingSignals.status, opts.status));
  const rows = await db()
    .select()
    .from(tradingSignals)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tradingSignals.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const pos = await db().select().from(positions).where(inArray(positions.signalId, ids));
  const deliveries = await db().select().from(signalDeliveries).where(inArray(signalDeliveries.signalId, ids));
  const byId: Record<string, { position: (typeof pos)[number] | null; delivery: (typeof deliveries)[number] | null }> = {};
  for (const r of rows) byId[r.id] = { position: null, delivery: null };
  for (const p of pos) if (byId[p.signalId]) byId[p.signalId]!.position = p;
  for (const d of deliveries) if (byId[d.signalId]) byId[d.signalId]!.delivery = d;
  return rows.map((r) => ({ ...r, position: byId[r.id]!.position, delivery: byId[r.id]!.delivery }));
}

/** Portfolio ledger. Each position is keyed by its source signal; we join back
 * the signal's conviction/thesis/targets so the row reads on its own. */
export async function listPositions(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(positions.symbol, opts.symbol));
  if (opts.status) conds.push(eq(positions.status, opts.status));
  const rows = await db()
    .select()
    .from(positions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(positions.openedAt))
    .limit(limit)
    .offset(Math.max(0, opts.offset ?? 0));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.signalId);
  const sigs = await db()
    .select({
      id: tradingSignals.id,
      conviction: tradingSignals.conviction,
      targetPrice: tradingSignals.targetPrice,
      stopLoss: tradingSignals.stopLoss,
      thesis: tradingSignals.thesis,
      expiresAt: tradingSignals.expiresAt,
    })
    .from(tradingSignals)
    .where(inArray(tradingSignals.id, ids));
  const byId: Record<string, (typeof sigs)[number]> = {};
  for (const s of sigs) byId[s.id] = s;
  return rows.map((r) => ({ ...r, signal: byId[r.signalId] ?? null }));
}

export async function listValuations(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(valuationSnapshots.symbol, opts.symbol));
  if (opts.status) conds.push(eq(valuationSnapshots.verdict, opts.status));
  return db()
    .select()
    .from(valuationSnapshots)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(valuationSnapshots.createdAt))
    .limit(limit);
}

/** Discovery review queue. Defaults to the pending candidates, highest score first. */
export async function listCandidates(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 200, 500);
  const status = opts.status ?? "pending";
  return db()
    .select()
    .from(candidates)
    .where(eq(candidates.status, status))
    .orderBy(desc(candidates.score), desc(candidates.lastSeenAt))
    .limit(limit)
    .offset(Math.max(0, opts.offset ?? 0));
}
