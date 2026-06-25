/**
 * Read queries: watchlist "home base" + per-symbol data freshness.
 * All read-only, Node runtime only.
 */

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  watchlist,
  watchlistLists,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  valuationSnapshots,
  positions,
  universe,
} from "../db.js";

/** Per-watchlist-symbol data freshness: latest price date + latest filing knownAt.
 *  Scoped to the session user's watchlist (the table is per-user). */
export async function getDataFreshness(userId: string) {
  const symbols = await db().select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(watchlist.symbol);

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
export async function listWatchlistOverview(userId: string) {
  const wl = await db().select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(watchlist.symbol);
  if (wl.length === 0) return [];
  const syms = wl.map((w) => w.symbol);

  // Daily-close momentum (Change% / YTD%) from the cached prices: latest two closes
  // per symbol for the day change, and the first close of the current year for YTD.
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const recentSub = db()
    .select({
      symbol: dailyPrices.symbol,
      close: dailyPrices.close,
      rn: sql<number>`row_number() over (partition by ${dailyPrices.symbol} order by ${dailyPrices.tradeDate} desc)`.as("rn"),
    })
    .from(dailyPrices)
    .where(inArray(dailyPrices.symbol, syms))
    .as("recent");

  const [vals, pos, uni, recent, ytdRows] = await Promise.all([
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
    db().select({ symbol: universe.symbol, sector: universe.sector, beta: universe.beta }).from(universe).where(inArray(universe.symbol, syms)),
    db().select({ symbol: recentSub.symbol, close: recentSub.close, rn: recentSub.rn }).from(recentSub).where(sql`${recentSub.rn} <= 2`),
    db()
      .selectDistinctOn([dailyPrices.symbol], { symbol: dailyPrices.symbol, close: dailyPrices.close })
      .from(dailyPrices)
      .where(and(inArray(dailyPrices.symbol, syms), gte(dailyPrices.tradeDate, yearStart)))
      .orderBy(dailyPrices.symbol, dailyPrices.tradeDate),
  ]);

  const vBy = new Map(vals.map((v) => [v.symbol, v]));
  const pBy = new Map(pos.map((p) => [p.symbol, p]));
  const uBy = new Map(uni.map((u) => [u.symbol, u]));
  const lastBy = new Map<string, number>();
  const prevBy = new Map<string, number>();
  for (const r of recent) {
    if (r.close == null) continue;
    if (Number(r.rn) === 1) lastBy.set(r.symbol, r.close);
    else if (Number(r.rn) === 2) prevBy.set(r.symbol, r.close);
  }
  const ytdBaseBy = new Map<string, number>();
  for (const r of ytdRows) if (r.close != null) ytdBaseBy.set(r.symbol, r.close);

  return wl
    .map((w) => {
      const v = vBy.get(w.symbol);
      const p = pBy.get(w.symbol);
      const last = lastBy.get(w.symbol) ?? null;
      const prev = prevBy.get(w.symbol) ?? null;
      const ytdBase = ytdBaseBy.get(w.symbol) ?? null;
      return {
        symbol: w.symbol,
        note: w.note,
        addedAt: w.addedAt,
        listId: w.listId ?? null,
        sector: uBy.get(w.symbol)?.sector ?? null,
        beta: uBy.get(w.symbol)?.beta ?? null,
        changePct: last != null && prev != null && prev !== 0 ? ((last - prev) / prev) * 100 : null,
        ytdPct: last != null && ytdBase != null && ytdBase !== 0 ? ((last - ytdBase) / ytdBase) * 100 : null,
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

/** The signed-in user's named watchlist groups (tabs), ordered. */
export async function listUserWatchlistLists(userId: string): Promise<Array<{ id: string; name: string }>> {
  return db()
    .select({ id: watchlistLists.id, name: watchlistLists.name })
    .from(watchlistLists)
    .where(eq(watchlistLists.userId, userId))
    .orderBy(asc(watchlistLists.sortOrder), asc(watchlistLists.createdAt));
}
