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
  financialRatios,
  ratings,
  priceTargets,
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

  // Daily-close history from the cached prices: latest two closes (day change),
  // the first close of the current year (YTD), and the trailing-year window for
  // the 52-week high + 1-year return.
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const recentSub = db()
    .select({
      symbol: dailyPrices.symbol,
      close: dailyPrices.close,
      rn: sql<number>`row_number() over (partition by ${dailyPrices.symbol} order by ${dailyPrices.tradeDate} desc)`.as("rn"),
    })
    .from(dailyPrices)
    .where(inArray(dailyPrices.symbol, syms))
    .as("recent");

  const [vals, pos, uni, recent, ytdRows, hi52Rows, y1Rows, ratiosRows, targetRows, ratingRows] = await Promise.all([
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
    db()
      .select({
        symbol: universe.symbol,
        name: universe.name,
        sector: universe.sector,
        industry: universe.industry,
        archetype: universe.archetype,
        beta: universe.beta,
      })
      .from(universe)
      .where(inArray(universe.symbol, syms)),
    db().select({ symbol: recentSub.symbol, close: recentSub.close, rn: recentSub.rn }).from(recentSub).where(sql`${recentSub.rn} <= 2`),
    db()
      .selectDistinctOn([dailyPrices.symbol], { symbol: dailyPrices.symbol, close: dailyPrices.close })
      .from(dailyPrices)
      .where(and(inArray(dailyPrices.symbol, syms), gte(dailyPrices.tradeDate, yearStart)))
      .orderBy(dailyPrices.symbol, dailyPrices.tradeDate),
    // 52-week high (max intraday high over the trailing year).
    db()
      .select({ symbol: dailyPrices.symbol, hi: sql<number>`max(${dailyPrices.high})` })
      .from(dailyPrices)
      .where(and(inArray(dailyPrices.symbol, syms), gte(dailyPrices.tradeDate, oneYearAgo)))
      .groupBy(dailyPrices.symbol),
    // First close on/after one year ago → 1-year-return base.
    db()
      .selectDistinctOn([dailyPrices.symbol], { symbol: dailyPrices.symbol, close: dailyPrices.close })
      .from(dailyPrices)
      .where(and(inArray(dailyPrices.symbol, syms), gte(dailyPrices.tradeDate, oneYearAgo)))
      .orderBy(dailyPrices.symbol, dailyPrices.tradeDate),
    // Latest fundamentals row per symbol (P/E, P/B, D/E, margin, yield, EV/EBITDA).
    db()
      .selectDistinctOn([financialRatios.symbol], { symbol: financialRatios.symbol, data: financialRatios.data })
      .from(financialRatios)
      .where(inArray(financialRatios.symbol, syms))
      .orderBy(financialRatios.symbol, desc(financialRatios.knownAt)),
    // Latest analyst price target per symbol.
    db()
      .selectDistinctOn([priceTargets.symbol], { symbol: priceTargets.symbol, data: priceTargets.data })
      .from(priceTargets)
      .where(inArray(priceTargets.symbol, syms))
      .orderBy(priceTargets.symbol, desc(priceTargets.observedAt)),
    // Latest analyst rating/grade per symbol.
    db()
      .selectDistinctOn([ratings.symbol], { symbol: ratings.symbol, data: ratings.data })
      .from(ratings)
      .where(inArray(ratings.symbol, syms))
      .orderBy(ratings.symbol, desc(ratings.observedAt)),
  ]);

  const vBy = new Map(vals.map((v) => [v.symbol, v]));
  const pBy = new Map(pos.map((p) => [p.symbol, p]));
  const uBy = new Map(uni.map((u) => [u.symbol, u]));
  const hi52By = new Map(hi52Rows.map((r) => [r.symbol, r.hi]));
  const y1By = new Map<string, number>();
  for (const r of y1Rows) if (r.close != null) y1By.set(r.symbol, r.close);
  const ratiosBy = new Map(ratiosRows.map((r) => [r.symbol, r.data as Record<string, unknown>]));
  const targetBy = new Map(targetRows.map((r) => [r.symbol, r.data as Record<string, unknown>]));
  const ratingBy = new Map(ratingRows.map((r) => [r.symbol, r.data as Record<string, unknown>]));
  const lastBy = new Map<string, number>();
  const prevBy = new Map<string, number>();
  for (const r of recent) {
    if (r.close == null) continue;
    if (Number(r.rn) === 1) lastBy.set(r.symbol, r.close);
    else if (Number(r.rn) === 2) prevBy.set(r.symbol, r.close);
  }
  const ytdBaseBy = new Map<string, number>();
  for (const r of ytdRows) if (r.close != null) ytdBaseBy.set(r.symbol, r.close);

  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);

  return wl
    .map((w) => {
      const v = vBy.get(w.symbol);
      const p = pBy.get(w.symbol);
      const u = uBy.get(w.symbol);
      const ratios = ratiosBy.get(w.symbol);
      const tgt = targetBy.get(w.symbol);
      const rating = ratingBy.get(w.symbol);
      const last = lastBy.get(w.symbol) ?? null;
      const prev = prevBy.get(w.symbol) ?? null;
      const ytdBase = ytdBaseBy.get(w.symbol) ?? null;
      const hi52 = hi52By.get(w.symbol) ?? null;
      const y1 = y1By.get(w.symbol) ?? null;
      const target = num(tgt?.priceTarget);
      const entry = p?.entryPrice ?? null;
      const nm = num(ratios?.netProfitMargin); // FMP stores margins as a fraction
      return {
        symbol: w.symbol,
        note: w.note,
        addedAt: w.addedAt,
        listId: w.listId ?? null,
        name: u?.name ?? null,
        sector: u?.sector ?? null,
        industry: u?.industry ?? null,
        archetype: u?.archetype ?? null,
        beta: u?.beta ?? null,
        changePct: last != null && prev != null && prev !== 0 ? ((last - prev) / prev) * 100 : null,
        ytdPct: last != null && ytdBase != null && ytdBase !== 0 ? ((last - ytdBase) / ytdBase) * 100 : null,
        ret1y: last != null && y1 != null && y1 !== 0 ? ((last - y1) / y1) * 100 : null,
        pctBelow52w: last != null && hi52 != null && hi52 !== 0 ? ((last - hi52) / hi52) * 100 : null,
        fairValue: v?.fairValue ?? null,
        price: v?.price ?? null,
        upsidePct: v?.upsidePct ?? null,
        verdict: v?.verdict ?? null,
        asOf: v?.asOf ?? null,
        analystTarget: target,
        targetUpsidePct: target != null && last != null && last !== 0 ? ((target - last) / last) * 100 : null,
        analystRating: str(rating?.newGrade),
        pe: num(ratios?.priceToEarningsRatio),
        pb: num(ratios?.priceToBookRatio),
        de: num(ratios?.debtToEquityRatio),
        netMargin: nm != null ? nm * 100 : null,
        divYield: num(ratios?.dividendYieldPercentage), // already a percent
        evEbitda: num(ratios?.enterpriseValueMultiple),
        held: !!p,
        shares: p?.shares ?? null,
        entryPrice: entry,
        plPct: entry != null && entry !== 0 && last != null ? ((last - entry) / entry) * 100 : null,
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
