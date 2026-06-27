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
  dividends,
  earningsCalendar,
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
import { listSignals } from "./lists.js";

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

/** Dividend history for the Financials tab (ex / record / payment dates + amount +
 * yield). Read-through cached by data (data_dividends, warmed from FMP); newest
 * first. Raw FMP `data` jsonb — the UI picks the fields it shows. */
export async function getDividendHistory(symbol: string, limit = 24) {
  return db()
    .select({ observedAt: dividends.observedAt, data: dividends.data })
    .from(dividends)
    .where(eq(dividends.symbol, symbol.toUpperCase()))
    .orderBy(desc(dividends.observedAt))
    .limit(limit);
}

export type ChartMarkerKind = "earnings" | "event" | "insider_buy" | "insider_sell" | "dividend";
export interface ChartMarkerRow {
  time: string; // YYYY-MM-DD
  kind: ChartMarkerKind;
  label: string;
}

/** Event markers for the price Chart tab — earnings reports, 8-K material events,
 * insider (Form 4) buys/sells, and dividend ex-dates — composed from the existing
 * per-symbol reads into one flat list. Lets a researcher tie price moves to the
 * facts (e.g. a drop next to an 8-K or insider sale). All dates YYYY-MM-DD. */
export async function getChartOverlays(symbol: string): Promise<{ markers: ChartMarkerRow[] }> {
  const sym = symbol.toUpperCase();
  const [eightK, insiders, divs, earn] = await Promise.all([
    getEventsData(sym),
    getInsidersData(sym),
    getDividendHistory(sym, 40),
    db()
      .select({ reportDate: earningsCalendar.reportDate, epsActual: earningsCalendar.epsActual, epsEstimated: earningsCalendar.epsEstimated })
      .from(earningsCalendar)
      .where(eq(earningsCalendar.symbol, sym))
      .orderBy(desc(earningsCalendar.reportDate))
      .limit(40),
  ]);

  const markers: ChartMarkerRow[] = [];
  const day = (s: string | null | undefined) => (s && s.length >= 10 ? s.slice(0, 10) : null);

  for (const e of earn) {
    const beat = e.epsActual != null && e.epsEstimated != null ? e.epsActual >= e.epsEstimated : null;
    markers.push({ time: e.reportDate, kind: "earnings", label: beat === true ? "E+" : beat === false ? "E−" : "E" });
  }
  for (const ev of eightK.events) {
    const t = day(ev.reportDate) ?? day(ev.filedDate);
    if (t) markers.push({ time: t, kind: "event", label: "8K" });
  }
  for (const tx of insiders.insiders) {
    const t = day(tx.date);
    if (!t) continue;
    if (tx.signal === "buy") markers.push({ time: t, kind: "insider_buy", label: "B" });
    else if (tx.signal === "sell") markers.push({ time: t, kind: "insider_sell", label: "S" });
  }
  for (const d of divs) {
    const ex = day((d.data as { date?: string } | null)?.date);
    if (ex) markers.push({ time: ex, kind: "dividend", label: "D" });
  }
  return { markers };
}
