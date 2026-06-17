/**
 * Read queries: a user's live IBKR account mirror (status / NAV-vs-SPY /
 * positions / trades). Reads data_holdings_* scoped to the caller's `userId`
 * (the tenant key = Better Auth user id, stored as account_id). All read-only,
 * Node runtime only. The Flex token is never read here (it's encrypted at rest;
 * the dashboard only needs "connected").
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  holdingsAccounts,
  holdingsNavHistory,
  holdingsTrades,
  holdingsPositions,
  dailyPrices,
} from "../db.js";
import { config, metrics, type DailyReturn } from "@qt/shared";

/** Connection status for the holdings settings form. Returns only whether an
 *  IBKR Flex link exists (never the token — it's encrypted in the data service). */
export async function getHoldingsStatus(userId: string) {
  const rows = await db()
    .select({ flexQueryId: holdingsAccounts.flexQueryId, updatedAt: holdingsAccounts.updatedAt })
    .from(holdingsAccounts)
    .where(eq(holdingsAccounts.accountId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return { connected: false, flexQueryId: null, updatedAt: null };
  return { connected: true, flexQueryId: row.flexQueryId, updatedAt: row.updatedAt };
}

/**
 * NAV-vs-SPY series (both rebased to 100 at the first NAV date) plus the full
 * performance KPI set. SPY closes come from data_daily_prices (warmed by the
 * sync job); each is aligned to a NAV date and rebased so the two lines are
 * comparable. KPIs return null below their min-history threshold.
 */
export async function getHoldingsNav(userId: string) {
  const navRows = await db()
    .select({
      date: holdingsNavHistory.date,
      navIndex: holdingsNavHistory.navIndex,
      dailyReturn: holdingsNavHistory.dailyReturn,
      endingNav: holdingsNavHistory.endingNav,
    })
    .from(holdingsNavHistory)
    .where(eq(holdingsNavHistory.accountId, userId))
    .orderBy(holdingsNavHistory.date);

  if (navRows.length === 0) {
    return { asOf: null, navIndex: null, endingNav: null, points: [], kpis: null };
  }

  const firstDate = navRows[0]!.date;
  const spyRows = await db()
    .select({ date: dailyPrices.tradeDate, close: dailyPrices.close })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.symbol, "SPY"), gte(dailyPrices.tradeDate, firstDate)))
    .orderBy(dailyPrices.tradeDate);
  const spyByDate = new Map(spyRows.filter((r) => r.close != null).map((r) => [r.date, r.close as number]));

  // Rebase both to 100 at the first NAV date that also has a SPY close.
  const navBase = navRows[0]!.navIndex;
  const spyBase = navRows.map((r) => spyByDate.get(r.date)).find((c): c is number => c != null) ?? null;
  const points = navRows.map((r) => {
    const spyClose = spyByDate.get(r.date);
    return {
      date: r.date,
      nav: navBase ? (r.navIndex / navBase) * 100 : 100,
      spy: spyBase != null && spyClose != null ? (spyClose / spyBase) * 100 : null,
    };
  });

  // KPI inputs.
  const rf = config.riskFreeRate();
  const portReturns: DailyReturn[] = navRows.map((r) => ({ date: r.date, r: r.dailyReturn }));
  const navSeries = navRows.map((r) => ({ date: r.date, nav: r.navIndex }));
  const spyReturns = metrics.pricesToReturns(
    spyRows.filter((r) => r.close != null).map((r) => ({ date: r.date, close: r.close as number })),
  );
  const aligned = metrics.alignSeries(portReturns, spyReturns);
  const b = metrics.beta(aligned.a, aligned.b);

  const kpis = {
    cagr: metrics.cagr(navRows[0]!.navIndex, navRows[navRows.length - 1]!.navIndex, navRows.length),
    volatility: metrics.annualizedVolatility(portReturns),
    sharpe: metrics.sharpe(portReturns, rf),
    sortino: metrics.sortino(portReturns, rf),
    maxDrawdown: metrics.maxDrawdown(navSeries)?.maxDD ?? null,
    calmar: metrics.calmar(navSeries),
    beta: b,
    alpha: metrics.alpha(aligned.a, aligned.b, rf),
    informationRatio: metrics.informationRatio(aligned.a, aligned.b),
    treynor: b != null ? metrics.treynor(portReturns, rf, b) : null,
  };

  const last = navRows[navRows.length - 1]!;
  return { asOf: last.date, navIndex: last.navIndex, endingNav: last.endingNav, points, kpis };
}

/** Current holdings — the latest as_of_date snapshot, sorted longs → shorts → cash by weight. */
export async function listHoldingsPositions(userId: string) {
  const latest = await db()
    .select({ d: sql<string>`max(${holdingsPositions.asOfDate})` })
    .from(holdingsPositions)
    .where(eq(holdingsPositions.accountId, userId));
  const asOf = latest[0]?.d ?? null;
  if (!asOf) return { asOf: null, positions: [] };

  const rows = await db()
    .select()
    .from(holdingsPositions)
    .where(and(eq(holdingsPositions.accountId, userId), eq(holdingsPositions.asOfDate, asOf)));

  // Bucket cash last, then sort by signed weight DESC (dollar-impact order).
  const sorted = rows.sort((a, b) => {
    const ca = a.assetClass === "CASH" ? 1 : 0;
    const cb = b.assetClass === "CASH" ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return (b.weightPct ?? 0) - (a.weightPct ?? 0);
  });
  return { asOf, positions: sorted };
}

interface HoldingsTradeOpts {
  symbol?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

/** Executed trades, newest first. Optional symbol / since filters + pagination. */
export async function listHoldingsTrades(userId: string, opts: HoldingsTradeOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conds = [eq(holdingsTrades.accountId, userId)];
  if (opts.symbol) conds.push(eq(holdingsTrades.symbol, opts.symbol.toUpperCase()));
  if (opts.since) conds.push(gte(holdingsTrades.tradeDate, opts.since));
  return db()
    .select()
    .from(holdingsTrades)
    .where(and(...conds))
    .orderBy(desc(holdingsTrades.tradeDate), desc(holdingsTrades.externalTradeId))
    .limit(limit)
    .offset(Math.max(0, opts.offset ?? 0));
}
