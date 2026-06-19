/**
 * Earnings-calendar read — the enriched, market-cap-ranked calendar backing the
 * Discover grid. Reads `data_earnings_calendar` (written by data's daily enrich job).
 * The Drizzle db is injected (web = neon-http, data = pg Pool). All read-only.
 */
import { and, asc, gte, lte } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { earningsCalendar } from "./db/schema.js";

export type ReadDb = PgDatabase<any, any, any>;

export interface EarningsCalEntry {
  symbol: string;
  reportDate: string; // YYYY-MM-DD
  name: string | null;
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
  marketCap: number | null;
  sector: string | null;
  logoUrl: string | null;
}

export interface EarningsDay {
  date: string; // YYYY-MM-DD
  total: number; // how many companies report that day (before the top-N cut)
  top: EarningsCalEntry[];
}

/** All enriched earnings rows with reportDate in [from, to] (inclusive), date asc. */
export async function getEarningsCalendar(db: ReadDb, from: string, to: string): Promise<EarningsCalEntry[]> {
  const rows = await db
    .select({
      symbol: earningsCalendar.symbol,
      reportDate: earningsCalendar.reportDate,
      name: earningsCalendar.name,
      epsEstimated: earningsCalendar.epsEstimated,
      epsActual: earningsCalendar.epsActual,
      revenueEstimated: earningsCalendar.revenueEstimated,
      revenueActual: earningsCalendar.revenueActual,
      marketCap: earningsCalendar.marketCap,
      sector: earningsCalendar.sector,
      logoUrl: earningsCalendar.logoUrl,
    })
    .from(earningsCalendar)
    .where(and(gte(earningsCalendar.reportDate, from), lte(earningsCalendar.reportDate, to)))
    .orderBy(asc(earningsCalendar.reportDate));
  return rows as EarningsCalEntry[];
}

/** Pure: group rows by reportDate, rank each day by market cap (desc, nulls last),
 *  keep the top `n` + the day's total. Days are returned date-ascending. */
export function groupTopNPerDay(rows: EarningsCalEntry[], n: number): EarningsDay[] {
  const byDate = new Map<string, EarningsCalEntry[]>();
  for (const r of rows) {
    const arr = byDate.get(r.reportDate);
    if (arr) arr.push(r);
    else byDate.set(r.reportDate, [r]);
  }
  const cap = (e: EarningsCalEntry) => (e.marketCap == null ? -1 : e.marketCap);
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => ({
      date,
      total: day.length,
      top: [...day].sort((a, b) => cap(b) - cap(a)).slice(0, Math.max(0, n)),
    }));
}
