/**
 * Per-symbol research read queries — shared by the web dashboard and data's MCP
 * endpoint so both serve identical shapes from a single source. The Drizzle db
 * client is injected (web uses a neon-http client, data a pg Pool); both are
 * `PgDatabase`, so the query builders here are driver-agnostic. All read-only.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  valuationSnapshots,
  dailyPrices,
  incomeStatement,
  balanceSheet,
  cashFlow,
  financialRatios,
  analystEstimates,
  ratings,
  priceTargets,
  newsItems,
} from "./db/schema.js";

// Either driver's db is a PgDatabase; the `.select()...` builders are identical.
export type ResearchDb = PgDatabase<any, any, any>;

/** Latest reference-valuation snapshot for a symbol (with full per-model `detail`). */
export async function getLatestValuation(db: ResearchDb, symbol: string) {
  const rows = await db
    .select()
    .from(valuationSnapshots)
    .where(eq(valuationSnapshots.symbol, symbol))
    .orderBy(desc(valuationSnapshots.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** OHLCV bars (ascending by date, as lightweight-charts requires) + the latest
 *  fair value and the per-asOf fair-value history for the overlay line. */
export async function getPrices(db: ResearchDb, symbol: string, opts: { days?: number } = {}) {
  const days = Math.min(opts.days ?? 800, 2000);
  const [rows, val, fvRows] = await Promise.all([
    db
      .select({
        time: dailyPrices.tradeDate,
        open: dailyPrices.open,
        high: dailyPrices.high,
        low: dailyPrices.low,
        close: dailyPrices.close,
        volume: dailyPrices.volume,
      })
      .from(dailyPrices)
      .where(eq(dailyPrices.symbol, symbol))
      .orderBy(desc(dailyPrices.tradeDate))
      .limit(days),
    getLatestValuation(db, symbol),
    db
      .select({ asOf: valuationSnapshots.asOf, fv: valuationSnapshots.fairValuePerShare, createdAt: valuationSnapshots.createdAt })
      .from(valuationSnapshots)
      .where(eq(valuationSnapshots.symbol, symbol))
      .orderBy(valuationSnapshots.asOf, valuationSnapshots.createdAt),
  ]);
  const fvByDate = new Map<string, number>();
  for (const r of fvRows) {
    if (r.asOf && typeof r.fv === "number" && Number.isFinite(r.fv)) fvByDate.set(r.asOf.slice(0, 10), r.fv);
  }
  const fvHistory = [...fvByDate.entries()].map(([time, value]) => ({ time, value }));
  return {
    symbol,
    bars: rows.reverse(),
    fairValue: val?.fairValuePerShare ?? null,
    asOf: val?.createdAt ?? null,
    fvHistory,
  };
}

/** Sell-side analyst activity: ratings, price targets, forward estimates. (Insider
 *  trades moved to the Ownership view — see @qt/shared/form4-read.) */
export async function getAnalystsData(db: ResearchDb, symbol: string) {
  const [rate, pt, est] = await Promise.all([
    db.select({ observedAt: ratings.observedAt, data: ratings.data }).from(ratings).where(eq(ratings.symbol, symbol)).orderBy(desc(ratings.observedAt)).limit(60),
    db.select({ observedAt: priceTargets.observedAt, data: priceTargets.data }).from(priceTargets).where(eq(priceTargets.symbol, symbol)).orderBy(desc(priceTargets.observedAt)).limit(25),
    db
      .select({ fiscalDate: analystEstimates.fiscalDate, data: analystEstimates.data })
      .from(analystEstimates)
      .where(and(eq(analystEstimates.symbol, symbol), eq(analystEstimates.period, "annual")))
      .orderBy(desc(analystEstimates.fiscalDate))
      .limit(8),
  ]);
  return { symbol, ratings: rate, priceTargets: pt, estimates: est.reverse() };
}

/** Multi-period statements (income/balance/cash-flow + ratios), oldest→newest so
 *  the UI charts trends left-to-right. Annual by default. */
export async function getFinancials(
  db: ResearchDb,
  symbol: string,
  opts: { period?: "annual" | "quarter"; limit?: number } = {},
) {
  const period = opts.period === "quarter" ? "quarter" : "annual";
  const limit = Math.min(opts.limit ?? 8, 16);
  const q = (
    tbl: typeof incomeStatement | typeof cashFlow | typeof balanceSheet | typeof financialRatios | typeof analystEstimates,
    rows = limit,
  ) =>
    db
      .select({ fiscalDate: tbl.fiscalDate, data: tbl.data })
      .from(tbl)
      .where(and(eq(tbl.symbol, symbol), eq(tbl.period, period)))
      .orderBy(desc(tbl.fiscalDate))
      .limit(rows);
  const [income, cashflow, balance, ratios, estimates] = await Promise.all([
    q(incomeStatement),
    q(cashFlow),
    q(balanceSheet),
    q(financialRatios),
    // Estimates include future fiscal years → fetch a few extra so the forward
    // years (newest-first) survive the slice before we reverse to ascending.
    q(analystEstimates, limit + 4),
  ]);
  return {
    symbol,
    period,
    income: income.reverse(),
    cashflow: cashflow.reverse(),
    balance: balance.reverse(),
    ratios: ratios.reverse(),
    estimates: estimates.reverse(),
  };
}

/** Recent news for a symbol (newest first), matching the dashboard's ordering. */
export async function getSymbolNews(db: ResearchDb, symbol: string, limit = 20) {
  return db
    .select()
    .from(newsItems)
    .where(eq(newsItems.symbol, symbol))
    .orderBy(sql`${newsItems.publishedAt} desc nulls last`, desc(newsItems.pulledAt))
    .limit(Math.min(limit, 50));
}
