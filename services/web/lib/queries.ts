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
  signalOutcomes,
  feedbackNotes,
  valuationSnapshots,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  watchlist,
  logs,
} from "./db.js";

const SERVICES = ["ingestion", "analysis", "evaluation"] as const;
const STUCK_MINUTES = 5;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
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
    outcomesTotal,
    feedbackTotal,
    eventsDelivery,
    notifDelivery,
    eventsPipeline,
    notifPipeline,
    sigDelivery,
    signalStatus,
    serviceHeartbeats,
    stuckNotifs,
    stuckEvents,
    expiredOpenSignals,
    recentErrors,
  ] = await Promise.all([
    db().select({ c: count() }).from(events).where(gte(events.ingestedAt, since)),
    db().select({ c: count() }).from(notifications).where(gte(notifications.ingestedAt, since)),
    db().select({ c: count() }).from(tradingSignals).where(gte(tradingSignals.createdAt, since)),
    db().select({ c: count() }).from(signalOutcomes).where(gte(signalOutcomes.updatedAt, since)),
    db().select({ c: count() }).from(feedbackNotes).where(gte(feedbackNotes.createdAt, since)),
    db().select({ k: events.deliveryStatus, c: count() }).from(events).groupBy(events.deliveryStatus),
    db().select({ k: notifications.deliveryStatus, c: count() }).from(notifications).groupBy(notifications.deliveryStatus),
    db().select({ k: events.status, c: count() }).from(events).groupBy(events.status),
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
      .from(events)
      .where(and(eq(events.status, "processing"), lt(events.ingestedAt, stuckBefore))),
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
    const hit = serviceHeartbeats.find((h) => h.service === service);
    const last = hit?.last ?? null;
    const ageMs = last ? Date.now() - new Date(last).getTime() : null;
    const state = ageMs === null ? "unknown" : ageMs < 5 * 60_000 ? "up" : ageMs < 60 * 60_000 ? "idle" : "stale";
    return { service, last, state };
  });

  return {
    windowHours,
    funnel: {
      events: Number(eventsTotal[0]?.c ?? 0),
      notifications: Number(notifTotal[0]?.c ?? 0),
      signals: Number(signalsTotal[0]?.c ?? 0),
      outcomes: Number(outcomesTotal[0]?.c ?? 0),
      feedback: Number(feedbackTotal[0]?.c ?? 0),
    },
    outbox: {
      events: toMap(eventsDelivery),
      notifications: toMap(notifDelivery),
      signals: toMap(sigDelivery),
    },
    pipeline: {
      events: toMap(eventsPipeline),
      notifications: toMap(notifPipeline),
    },
    signalStatus: toMap(signalStatus),
    heartbeats,
    stuck: {
      notifications: Number(stuckNotifs[0]?.c ?? 0),
      events: Number(stuckEvents[0]?.c ?? 0),
      expiredOpenSignals: Number(expiredOpenSignals[0]?.c ?? 0),
    },
    recentErrors,
  };
}

interface ListOpts {
  limit?: number;
  symbol?: string;
  status?: string;
  deliveryStatus?: string;
  eventType?: string;
}

export async function listEvents(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(events.symbol, opts.symbol));
  if (opts.status) conds.push(eq(events.status, opts.status));
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
  const outcomes = await db().select().from(signalOutcomes).where(inArray(signalOutcomes.signalId, ids));
  const deliveries = await db().select().from(signalDeliveries).where(inArray(signalDeliveries.signalId, ids));
  const byId: Record<string, { outcomes: typeof outcomes; delivery: (typeof deliveries)[number] | null }> = {};
  for (const r of rows) byId[r.id] = { outcomes: [], delivery: null };
  for (const o of outcomes) byId[o.signalId]?.outcomes.push(o);
  for (const d of deliveries) if (byId[d.signalId]) byId[d.signalId]!.delivery = d;
  return rows.map((r) => ({ ...r, outcomes: byId[r.id]!.outcomes, delivery: byId[r.id]!.delivery }));
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

export async function listFeedback(opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [];
  if (opts.symbol) conds.push(eq(feedbackNotes.symbol, opts.symbol));
  if (opts.eventType) conds.push(eq(feedbackNotes.eventType, opts.eventType));
  return db()
    .select()
    .from(feedbackNotes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(feedbackNotes.createdAt))
    .limit(limit);
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
  const [ev, notifs, signals, vals, fb, lg] = await Promise.all([
    db().select().from(events).where(eq(events.symbol, symbol)).orderBy(desc(events.ingestedAt)).limit(100),
    db().select().from(notifications).where(eq(notifications.symbol, symbol)).orderBy(desc(notifications.ingestedAt)).limit(100),
    listSignals({ symbol, limit: 100 }),
    db().select().from(valuationSnapshots).where(eq(valuationSnapshots.symbol, symbol)).orderBy(desc(valuationSnapshots.createdAt)).limit(20),
    db().select().from(feedbackNotes).where(eq(feedbackNotes.symbol, symbol)).orderBy(desc(feedbackNotes.createdAt)).limit(50),
    db().select().from(logs).where(eq(logs.symbol, symbol)).orderBy(desc(logs.ts)).limit(300),
  ]);
  return { symbol, events: ev, notifications: notifs, signals, valuations: vals, feedback: fb, logs: lg };
}
