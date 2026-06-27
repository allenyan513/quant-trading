/**
 * Markets discovery (ported from web's `app/api/markets/*`): the enriched earnings
 * calendar (DB read + the caller's own symbols for highlighting — authed), plus live
 * FMP-backed calendars/movers forwarded to the data service.
 */
import type { Hono } from "hono";
import { route, authed } from "../route.js";
import { dataGet } from "../data-proxy.js";
import { listEarningsCalendar, myEarningsSymbols } from "../queries/index.js";
import type { EarningsHistRow, EconEventRow } from "@qt/shared/markets";

export function registerMarketsRoutes(app: Hono): void {
  // Enriched, market-cap-ranked earnings calendar for [from, to] + the caller's own
  // watchlist/holdings symbols (for highlighting). Defaults to 1-week-back / 5-week-ahead.
  app.get(
    "/markets/earnings",
    authed("markets.earnings", async (c, uid) => {
      const now = Date.now();
      const from = c.req.query("from") || new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
      const to = c.req.query("to") || new Date(now + 35 * 86_400_000).toISOString().slice(0, 10);
      const [rows, mine] = await Promise.all([listEarningsCalendar(from, to), myEarningsSymbols(uid)]);
      return { rows, mine };
    }),
  );

  // Per-symbol beat/miss history for the earnings detail drawer (live FMP via data).
  app.get(
    "/markets/earnings-history",
    route("markets.earnings_history", (c) => {
      const symbol = (c.req.query("symbol") || "").trim();
      return dataGet<EarningsHistRow[]>(`/markets/earnings-history?symbol=${encodeURIComponent(symbol)}`);
    }),
  );

  // Upcoming economic calendar (High/Medium impact); optional ?from&to override the window.
  app.get(
    "/markets/economic",
    route("markets.economic", (c) => dataGet<EconEventRow[]>(`/markets/economic-calendar${new URL(c.req.url).search}`)),
  );

  // Top gainers / losers / most-active — live, forwarded to data.
  app.get("/markets/movers", route("markets.movers", () => dataGet("/markets/movers")));
}
