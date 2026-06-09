/**
 * Read queries for the dashboard. All read-only. Run on the Node runtime
 * (route handlers), never in the Edge middleware.
 */

import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import {
  db,
  universe,
  events,
  notifications,
  newsItems,
  tradingSignals,
  signalDeliveries,
  positions,
  valuationSnapshots,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  financialRatios,
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

/** Latest reference-valuation snapshot for a symbol (with full per-model `detail`). */
export async function getLatestValuation(symbol: string) {
  const rows = await db()
    .select()
    .from(valuationSnapshots)
    .where(eq(valuationSnapshots.symbol, symbol))
    .orderBy(desc(valuationSnapshots.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Latest financial-ratios row for a symbol (newest filing first). `data` is the
 * raw FMP ratios jsonb; callers pick the fields they show. */
export async function getLatestRatios(symbol: string) {
  const rows = await db()
    .select()
    .from(financialRatios)
    .where(eq(financialRatios.symbol, symbol))
    .orderBy(desc(financialRatios.knownAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Header "company shell" for the per-symbol detail layout: identity + latest
 * price/verdict/upside. DB-only (no FMP); leans on universe + latest snapshot,
 * falling back to the latest daily close for price when no snapshot exists. */
export async function getCompanyShell(symbol: string) {
  const [uni, val, lastPrice, wl] = await Promise.all([
    db().select().from(universe).where(eq(universe.symbol, symbol)).limit(1),
    getLatestValuation(symbol),
    db()
      .select({ close: dailyPrices.close })
      .from(dailyPrices)
      .where(eq(dailyPrices.symbol, symbol))
      .orderBy(desc(dailyPrices.tradeDate))
      .limit(1),
    db().select({ symbol: watchlist.symbol }).from(watchlist).where(eq(watchlist.symbol, symbol)).limit(1),
  ]);
  const u = uni[0];
  const detail = (val?.detail ?? null) as { company_name?: string } | null;
  return {
    symbol,
    name: u?.name ?? detail?.company_name ?? null,
    sector: u?.sector ?? null,
    industry: u?.industry ?? null,
    price: val?.currentPrice ?? lastPrice[0]?.close ?? null,
    fairValue: val?.fairValuePerShare ?? null,
    upsidePct: val?.upsidePct ?? null,
    verdict: val?.verdict ?? null,
    asOf: val?.createdAt ?? null,
    inWatchlist: wl.length > 0,
  };
}

/** Lightweight summary for the per-symbol Overall tab: valuation gap, open
 * positions, latest news, latest key ratios. Composes existing read fns so the
 * cards each link to their deep-dive tab. (The heavy activity timeline stays on
 * the existing /api/symbol/[symbol] trace route.) */
export async function getSymbolOverview(symbol: string) {
  const [valuation, openPositions, news, ratios] = await Promise.all([
    getLatestValuation(symbol),
    listPositions({ symbol, status: "open", limit: 5 }),
    listNews({ symbol, limit: 5 }),
    getLatestRatios(symbol),
  ]);
  return { symbol, valuation, positions: openPositions, news, ratios };
}

/** Multi-period statements for the Financials tab. Reads the 4 cached statement
 * tables directly (raw FMP `data` jsonb), newest-first then reversed to
 * oldest→newest so the UI can chart trends left-to-right. Annual by default. */
export async function getFinancials(
  symbol: string,
  opts: { period?: "annual" | "quarter"; limit?: number } = {},
) {
  const period = opts.period === "quarter" ? "quarter" : "annual";
  const limit = Math.min(opts.limit ?? 8, 16);
  const q = (tbl: typeof incomeStatement | typeof cashFlow | typeof balanceSheet | typeof financialRatios) =>
    db()
      .select({ fiscalDate: tbl.fiscalDate, data: tbl.data })
      .from(tbl)
      .where(and(eq(tbl.symbol, symbol), eq(tbl.period, period)))
      .orderBy(desc(tbl.fiscalDate))
      .limit(limit);
  const [income, cashflow, balance, ratios] = await Promise.all([
    q(incomeStatement),
    q(cashFlow),
    q(balanceSheet),
    q(financialRatios),
  ]);
  // Oldest→newest so the UI charts trends left-to-right.
  return {
    symbol,
    period,
    income: income.reverse(),
    cashflow: cashflow.reverse(),
    balance: balance.reverse(),
    ratios: ratios.reverse(),
  };
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

/**
 * Watchlist "home base": each symbol joined with its latest reference valuation
 * (fair value / price / upside / verdict — the buy-zone signal), whether we hold
 * it, and its sector. Sorted most-undervalued first. Drives /data/watchlist.
 */
export async function listWatchlistOverview() {
  const wl = await db().select().from(watchlist).orderBy(watchlist.symbol);
  if (wl.length === 0) return [];
  const syms = wl.map((w) => w.symbol);

  const [vals, pos, uni] = await Promise.all([
    // Latest snapshot per symbol (DISTINCT ON keyed by symbol, newest first).
    db()
      .selectDistinctOn([valuationSnapshots.symbol], {
        symbol: valuationSnapshots.symbol,
        fairValue: valuationSnapshots.fairValuePerShare,
        price: valuationSnapshots.currentPrice,
        upsidePct: valuationSnapshots.upsidePct,
        verdict: valuationSnapshots.verdict,
        asOf: valuationSnapshots.asOf,
      })
      .from(valuationSnapshots)
      .where(inArray(valuationSnapshots.symbol, syms))
      .orderBy(valuationSnapshots.symbol, desc(valuationSnapshots.createdAt)),
    db()
      .select({ symbol: positions.symbol, shares: positions.shares, entryPrice: positions.entryPrice })
      .from(positions)
      .where(and(eq(positions.status, "open"), inArray(positions.symbol, syms))),
    db().select({ symbol: universe.symbol, sector: universe.sector }).from(universe).where(inArray(universe.symbol, syms)),
  ]);

  const vBy = new Map(vals.map((v) => [v.symbol, v]));
  const pBy = new Map(pos.map((p) => [p.symbol, p]));
  const uBy = new Map(uni.map((u) => [u.symbol, u]));

  return wl
    .map((w) => {
      const v = vBy.get(w.symbol);
      const p = pBy.get(w.symbol);
      return {
        symbol: w.symbol,
        source: w.source,
        addedAt: w.addedAt,
        expiresAt: w.expiresAt,
        sector: uBy.get(w.symbol)?.sector ?? null,
        fairValue: v?.fairValue ?? null,
        price: v?.price ?? null,
        upsidePct: v?.upsidePct ?? null,
        verdict: v?.verdict ?? null,
        asOf: v?.asOf ?? null,
        held: !!p,
        shares: p?.shares ?? null,
        entryPrice: p?.entryPrice ?? null,
      };
    })
    // Most undervalued first; symbols without a valuation sink to the bottom.
    // Compare explicitly: two nulls would make (-Infinity)-(-Infinity)=NaN,
    // which yields an unstable sort.
    .sort((a, b) => {
      const av = a.upsidePct ?? -Infinity;
      const bv = b.upsidePct ?? -Infinity;
      return av === bv ? 0 : bv - av;
    });
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
