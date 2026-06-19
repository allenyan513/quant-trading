/**
 * Live market-wide snapshots from FMP for the Discover dashboard (issue #141 Phase 2):
 * top movers (gainers / losers / most-active), the earnings calendar, and the economic
 * calendar. Like edgar-fts these are LIVE passthroughs — not ingested into a table.
 * Per "data is the sole external receiver", only the data service calls the fetchers
 * (exposed at /markets/*); web forwards there. Pure shapers are unit-tested; the
 * fetchers do I/O via the shared fmpGet throttle.
 */
import { fmpGet } from "./fmp.js";

export interface MoverRow {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  exchange: string | null;
}
export interface MoversResult {
  gainers: MoverRow[];
  losers: MoverRow[];
  actives: MoverRow[];
}

export interface EarningsRow {
  symbol: string;
  date: string; // YYYY-MM-DD
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
}

export interface EconEventRow {
  date: string; // "YYYY-MM-DD HH:mm:ss"
  country: string | null;
  currency: string | null;
  event: string;
  impact: string | null; // "High" | "Medium" | "Low"
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  unit: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// ───────────────────────── pure shapers (unit-tested) ─────────────────────────

/** FMP gainers/losers/most-actives row → MoverRow. */
export function shapeMover(r: Record<string, unknown>): MoverRow {
  return {
    symbol: str(r.symbol) ?? "",
    name: str(r.name) ?? "",
    price: num(r.price),
    change: num(r.change),
    changePct: num(r.changesPercentage),
    exchange: str(r.exchange),
  };
}

/** FMP earnings-calendar row → EarningsRow. */
export function shapeEarnings(r: Record<string, unknown>): EarningsRow {
  return {
    symbol: str(r.symbol) ?? "",
    date: (str(r.date) ?? "").slice(0, 10),
    epsEstimated: num(r.epsEstimated),
    epsActual: num(r.epsActual),
    revenueEstimated: num(r.revenueEstimated),
    revenueActual: num(r.revenueActual),
  };
}

/** FMP economic-calendar row → EconEventRow. */
export function shapeEconEvent(r: Record<string, unknown>): EconEventRow {
  return {
    date: str(r.date) ?? "",
    country: str(r.country),
    currency: str(r.currency),
    event: str(r.event) ?? "",
    impact: str(r.impact),
    previous: num(r.previous),
    estimate: num(r.estimate),
    actual: num(r.actual),
    unit: str(r.unit),
  };
}

// ───────────────────────── fetchers (FMP I/O) ─────────────────────────

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Top gainers / losers / most-active (each capped to `limit`). One snapshot. */
export async function fetchMovers(limit = 25): Promise<MoversResult> {
  const [g, l, a] = await Promise.all([
    fmpGet<unknown>("biggest-gainers"),
    fmpGet<unknown>("biggest-losers"),
    fmpGet<unknown>("most-actives"),
  ]);
  const take = (v: unknown) => arr(v).slice(0, limit).map(shapeMover);
  return { gainers: take(g), losers: take(l), actives: take(a) };
}

/** Earnings calendar in [from, to]. Keeps analyst-covered rows (an EPS estimate),
 *  oldest date first. */
export async function fetchEarningsCalendar(from: string, to: string): Promise<EarningsRow[]> {
  const raw = await fmpGet<unknown>("earnings-calendar", { from, to });
  return arr(raw)
    .map(shapeEarnings)
    .filter((r) => r.symbol && r.epsEstimated != null)
    .sort((x, y) => x.date.localeCompare(y.date));
}

/** Economic calendar in [from, to]. Keeps High/Medium-impact events, soonest first. */
export async function fetchEconomicCalendar(from: string, to: string): Promise<EconEventRow[]> {
  const raw = await fmpGet<unknown>("economic-calendar", { from, to });
  return arr(raw)
    .map(shapeEconEvent)
    .filter((r) => r.event && (r.impact === "High" || r.impact === "Medium"))
    .sort((x, y) => x.date.localeCompare(y.date));
}
