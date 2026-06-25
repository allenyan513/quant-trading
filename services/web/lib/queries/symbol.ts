/**
 * Read queries: per-symbol detail (shell, overall, ratios, full trace) plus thin
 * wrappers over the shared research reads. All read-only, Node runtime only.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  universe,
  companyProfile,
  valuationSnapshots,
  dailyPrices,
  watchlist,
  financialRatios,
  events,
  notifications,
  logs,
} from "../db.js";
import {
  getLatestValuation as sharedGetLatestValuation,
  getPrices as sharedGetPrices,
  getAnalystsData as sharedGetAnalystsData,
  getFinancials as sharedGetFinancials,
} from "@qt/shared/research";
import { getOwnershipForSymbol as sharedGetOwnership } from "@qt/shared/ownership-read";
import { get8KForSymbol as sharedGet8K } from "@qt/shared/edgar-8k-read";
import { getInsidersForSymbol as sharedGetInsiders } from "@qt/shared/form4-read";
import { listPositions, listNews, listSignals } from "./lists.js";

/** Latest reference-valuation snapshot. Shared with data's MCP (see @qt/shared/research). */
export const getLatestValuation = (symbol: string) => sharedGetLatestValuation(db(), symbol);

/** OHLCV bars for the Chart tab (ascending by date, as lightweight-charts
 * requires) + the latest fair value for the overlay line. DB-only. */
export const getPrices = (symbol: string, opts: { days?: number } = {}) => sharedGetPrices(db(), symbol, opts);

/** Analyst + insider activity for the Analysts tab — surfaces the record caches
 * warmSymbol already fills (ratings/price targets/insider) plus forward analyst
 * estimates, none of which were displayed before. Raw FMP `data` jsonb; the UI
 * reads fields defensively. */
export const getAnalystsData = (symbol: string) => sharedGetAnalystsData(db(), symbol);

/** SEC ownership for the Ownership tab: this symbol's 13D/13G beneficial-ownership
 * filings + which tracked 13F legends hold it. Shared with the MCP get_symbol_research
 * ownership section (see @qt/shared/ownership-read). */
export const getOwnershipData = (symbol: string) => sharedGetOwnership(db(), symbol);

/** SEC 8-K material events for the Events tab: recent current-report filings with
 * decoded item codes (earnings / leadership / bankruptcy / …). Shared with the MCP
 * get_symbol_research events section (see @qt/shared/edgar-8k-read). */
export const getEventsData = (symbol: string) => sharedGet8K(db(), symbol);

/** SEC Form 4 insider transactions for the Ownership tab (rich: transaction code +
 * 10b5-1 + derivative), SEC-only. Shared with the MCP get_symbol_research
 * ownership section (see @qt/shared/form4-read). */
export const getInsidersData = (symbol: string) => sharedGetInsiders(db(), symbol);

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
export async function getCompanyShell(symbol: string, userId?: string) {
  const [uni, val, lastPrice, wl] = await Promise.all([
    db().select().from(universe).where(eq(universe.symbol, symbol)).limit(1),
    getLatestValuation(symbol),
    db()
      .select({ close: dailyPrices.close })
      .from(dailyPrices)
      .where(eq(dailyPrices.symbol, symbol))
      .orderBy(desc(dailyPrices.tradeDate))
      .limit(1),
    // Watchlist membership is per-user; without a session user there's no membership.
    userId
      ? db()
          .select({ symbol: watchlist.symbol })
          .from(watchlist)
          .where(and(eq(watchlist.symbol, symbol), eq(watchlist.userId, userId)))
          .limit(1)
      : Promise.resolve([] as { symbol: string }[]),
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

/** Full FMP company profile for the Overall tab (description / CEO / employees /
 * address / website / exchange / ipoDate …). Warmed by data into data_company_profile;
 * returns the raw FMP row + when it was fetched, or null if not yet warmed. */
export async function getCompanyProfile(symbol: string) {
  const [row] = await db()
    .select({ data: companyProfile.data, knownAt: companyProfile.knownAt })
    .from(companyProfile)
    .where(eq(companyProfile.symbol, symbol.toUpperCase()))
    .limit(1);
  if (!row) return null;
  return { profile: row.data as Record<string, unknown>, knownAt: row.knownAt };
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
export const getFinancials = (symbol: string, opts: { period?: "annual" | "quarter"; limit?: number } = {}) =>
  sharedGetFinancials(db(), symbol, opts);

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
