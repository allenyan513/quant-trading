/**
 * Read queries for the dashboard. All read-only. Run on the Node runtime
 * (route handlers), never in the Edge middleware.
 */

import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import {
  db,
  events,
  notifications,
  tradingSignals,
  signalDeliveries,
  positions,
  valuationSnapshots,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  watchlist,
  candidates,
  logs,
} from "./db.js";

const SERVICES = ["data", "alpha", "portfolio"] as const;
const STUCK_MINUTES = 5;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

/** Map a service's last-log timestamp to a liveness state. Shared so the nav
 * health dots and the overview heartbeats never drift apart. */
export function heartbeatState(last: string | null): string {
  if (!last) return "unknown";
  const ageMs = Date.now() - new Date(last).getTime();
  return ageMs < 5 * 60_000 ? "up" : ageMs < 60 * 60_000 ? "idle" : "stale";
}

/** Per-service liveness from the last structured log row. Cheap enough to poll
 * from the global nav (one grouped scan over `logs`). */
export async function getHeartbeats() {
  const rows = await db()
    .select({ service: logs.service, last: sql<string>`max(${logs.ts})` })
    .from(logs)
    .groupBy(logs.service);
  return SERVICES.map((service) => {
    const last = rows.find((r) => r.service === service)?.last ?? null;
    return { service, last, state: heartbeatState(last) };
  });
}

/** Fold [{k, c}] grouped-count rows into a {status: count} map. */
function toMap(rows: { k: string | null; c: number | string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.k ?? "unknown"] = Number(r.c);
  return out;
}

export async function getOverview(windowHours = 24) {
  const since = hoursAgo(windowHours);
  const now = new Date();
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);

  const [
    eventsTotal,
    notifTotal,
    signalsTotal,
    positionsTotal,
    eventsDelivery,
    notifDelivery,
    notifPipeline,
    sigDelivery,
    signalStatus,
    serviceHeartbeats,
    stuckNotifs,
    expiredOpenSignals,
    recentErrors,
  ] = await Promise.all([
    db().select({ c: count() }).from(events).where(gte(events.ingestedAt, since)),
    db().select({ c: count() }).from(notifications).where(gte(notifications.ingestedAt, since)),
    db().select({ c: count() }).from(tradingSignals).where(gte(tradingSignals.createdAt, since)),
    db().select({ c: count() }).from(positions).where(gte(positions.openedAt, since)),
    db().select({ k: events.deliveryStatus, c: count() }).from(events).groupBy(events.deliveryStatus),
    db().select({ k: notifications.deliveryStatus, c: count() }).from(notifications).groupBy(notifications.deliveryStatus),
    db().select({ k: notifications.status, c: count() }).from(notifications).groupBy(notifications.status),
    db()
      .select({ k: signalDeliveries.deliveryStatus, c: count() })
      .from(signalDeliveries)
      .groupBy(signalDeliveries.deliveryStatus),
    db()
      .select({ k: tradingSignals.status, c: count() })
      .from(tradingSignals)
      .groupBy(tradingSignals.status),
    db()
      .select({ service: logs.service, last: sql<string>`max(${logs.ts})` })
      .from(logs)
      .groupBy(logs.service),
    db()
      .select({ c: count() })
      .from(notifications)
      .where(and(eq(notifications.status, "processing"), lt(notifications.ingestedAt, stuckBefore))),
    db()
      .select({ c: count() })
      .from(tradingSignals)
      .where(and(eq(tradingSignals.status, "open"), lt(tradingSignals.expiresAt, now))),
    db()
      .select()
      .from(logs)
      .where(inArray(logs.level, ["error", "warn"]))
      .orderBy(desc(logs.ts))
      .limit(20),
  ]);

  const heartbeats = SERVICES.map((service) => {
    const last = serviceHeartbeats.find((h) => h.service === service)?.last ?? null;
    return { service, last, state: heartbeatState(last) };
  });

  return {
    windowHours,
    funnel: {
      events: Number(eventsTotal[0]?.c ?? 0),
      notifications: Number(notifTotal[0]?.c ?? 0),
      signals: Number(signalsTotal[0]?.c ?? 0),
      positions: Number(positionsTotal[0]?.c ?? 0),
    },
    outbox: {
      events: toMap(eventsDelivery),
      notifications: toMap(notifDelivery),
      signals: toMap(sigDelivery),
    },
    pipeline: {
      notifications: toMap(notifPipeline),
    },
    signalStatus: toMap(signalStatus),
    heartbeats,
    stuck: {
      notifications: Number(stuckNotifs[0]?.c ?? 0),
      expiredOpenSignals: Number(expiredOpenSignals[0]?.c ?? 0),
    },
    recentErrors,
  };
}

interface ListOpts {
  limit?: number;
  offset?: number;
  symbol?: string;
  status?: string;
  deliveryStatus?: string;
  eventType?: string;
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

interface LogOpts {
  limit?: number;
  service?: string;
  level?: string;
  symbol?: string;
  event?: string;
  q?: string;
}

export async function listLogs(opts: LogOpts = {}) {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const conds = [];
  if (opts.service) conds.push(eq(logs.service, opts.service));
  if (opts.level) conds.push(eq(logs.level, opts.level));
  if (opts.symbol) conds.push(eq(logs.symbol, opts.symbol));
  if (opts.event) conds.push(ilike(logs.event, `%${opts.event}%`));
  if (opts.q) {
    conds.push(
      or(
        ilike(logs.event, `%${opts.q}%`),
        ilike(sql`${logs.fields}::text`, `%${opts.q}%`),
        ilike(logs.symbol, `%${opts.q}%`),
      ),
    );
  }
  return db()
    .select()
    .from(logs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(logs.ts))
    .limit(limit);
}

/** Per-watchlist-symbol data freshness: latest price date + latest filing knownAt. */
export async function getDataFreshness() {
  const symbols = await db().select().from(watchlist).orderBy(watchlist.symbol);

  const [prices, inc, bal, cf] = await Promise.all([
    db()
      .select({ symbol: dailyPrices.symbol, last: sql<string>`max(${dailyPrices.tradeDate})` })
      .from(dailyPrices)
      .groupBy(dailyPrices.symbol),
    db()
      .select({ symbol: incomeStatement.symbol, last: sql<string>`max(${incomeStatement.knownAt})` })
      .from(incomeStatement)
      .groupBy(incomeStatement.symbol),
    db()
      .select({ symbol: balanceSheet.symbol, last: sql<string>`max(${balanceSheet.knownAt})` })
      .from(balanceSheet)
      .groupBy(balanceSheet.symbol),
    db()
      .select({ symbol: cashFlow.symbol, last: sql<string>`max(${cashFlow.knownAt})` })
      .from(cashFlow)
      .groupBy(cashFlow.symbol),
  ]);

  const map = (rows: { symbol: string; last: string | null }[]) => {
    const m: Record<string, string | null> = {};
    for (const r of rows) m[r.symbol] = r.last;
    return m;
  };
  const pm = map(prices);
  const im = map(inc);
  const bm = map(bal);
  const cm = map(cf);

  return symbols.map((s) => ({
    symbol: s.symbol,
    addedAt: s.addedAt,
    lastPriceDate: pm[s.symbol] ?? null,
    lastIncomeKnownAt: im[s.symbol] ?? null,
    lastBalanceKnownAt: bm[s.symbol] ?? null,
    lastCashFlowKnownAt: cm[s.symbol] ?? null,
  }));
}

/** Full cross-pipeline trace for one symbol, joined with its logs. */
export async function getSymbolTrace(symbol: string) {
  const [ev, notifs, signals, vals, lg] = await Promise.all([
    db().select().from(events).where(eq(events.symbol, symbol)).orderBy(desc(events.ingestedAt)).limit(100),
    db().select().from(notifications).where(eq(notifications.symbol, symbol)).orderBy(desc(notifications.ingestedAt)).limit(100),
    listSignals({ symbol, limit: 100 }),
    db().select().from(valuationSnapshots).where(eq(valuationSnapshots.symbol, symbol)).orderBy(desc(valuationSnapshots.createdAt)).limit(20),
    db().select().from(logs).where(eq(logs.symbol, symbol)).orderBy(desc(logs.ts)).limit(300),
  ]);
  return { symbol, events: ev, notifications: notifs, signals, valuations: vals, logs: lg };
}
