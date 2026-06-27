/**
 * Public symbol + market-data reads (ported from web's `app/api/data/symbol/*`,
 * `data/valuation`, `symbol/[symbol]`, `search`, `quotes`). All public; the writes here
 * (ensure/warm) forward to the data service, which owns the marketdata caches + valuation.
 */
import type { Hono } from "hono";
import type { Context } from "hono";
import { route, sessionUid, qstr, qint } from "../route.js";
import { dataGet, dataPost } from "../data-proxy.js";
import {
  getCompanyProfile,
  getAnalystsData,
  getDividendHistory,
  getEventsData,
  getFinancials,
  getInsidersData,
  getChartOverlays,
  getOwnershipData,
  getPrices,
  getCompanyShell,
  getLatestValuation,
  getSymbolTrace,
  searchSymbols,
} from "../queries/index.js";

interface LiveQuote {
  symbol: string;
  price: number;
  changePct: number | null;
  prevClose: number | null;
  fetchedAt: string;
}

/** Uppercased path `:symbol` (defensive — a path param is always present once matched). */
function symbolOf(c: Context): string {
  const s = c.req.param("symbol");
  if (!s) throw new Error("symbol required");
  return s.toUpperCase();
}

export function registerSymbolRoutes(app: Hono): void {
  app.get("/data/symbol/:symbol/profile", route("data.symbol.profile", (c) => getCompanyProfile(symbolOf(c))));
  app.get("/data/symbol/:symbol/analysts", route("data.symbol.analysts", (c) => getAnalystsData(symbolOf(c))));
  app.get("/data/symbol/:symbol/dividends", route("data.symbol.dividends", (c) => getDividendHistory(symbolOf(c))));
  app.get("/data/symbol/:symbol/events", route("data.symbol.events", (c) => getEventsData(symbolOf(c))));
  app.get(
    "/data/symbol/:symbol/financials",
    route("data.symbol.financials", (c) => {
      const period = qstr(c, "period") === "quarter" ? "quarter" : "annual";
      return getFinancials(symbolOf(c), { period, limit: qint(c, "limit") ?? 8 });
    }),
  );
  app.get("/data/symbol/:symbol/insiders", route("data.symbol.insiders", (c) => getInsidersData(symbolOf(c))));
  app.get("/data/symbol/:symbol/overlays", route("data.symbol.overlays", (c) => getChartOverlays(symbolOf(c))));
  app.get("/data/symbol/:symbol/ownership", route("data.symbol.ownership", (c) => getOwnershipData(symbolOf(c))));
  app.get(
    "/data/symbol/:symbol/prices",
    route("data.symbol.prices", (c) => getPrices(symbolOf(c), { days: qint(c, "days") ?? 800 })),
  );
  app.get(
    "/data/symbol/:symbol/shell",
    route("data.symbol.shell", async (c) => {
      // `inWatchlist` is per-user; fall back to "not in watchlist" if unauthenticated.
      const uid = await sessionUid(c).catch(() => null);
      return getCompanyShell(symbolOf(c), uid ?? undefined);
    }),
  );

  // Page-open auto-refresh — forward to data (warms marketdata + recomputes valuation
  // in the background, at most once per 24h). Fire-and-forget from the client.
  app.post(
    "/data/symbol/:symbol/ensure",
    route("data.symbol.ensure", (c) => dataPost("/ensure", { symbol: symbolOf(c) })),
  );

  // The detail page's "Refresh data": warm marketdata + news, then recompute the
  // reference valuation (best-effort — a transient valuation failure shouldn't fail the
  // whole refresh; the marketdata tabs already updated).
  app.post(
    "/data/symbol/:symbol/warm",
    route("data.symbol.warm", async (c) => {
      const symbol = symbolOf(c);
      const warmed = await dataPost<object>("/warm", { symbol });
      let valuation: { ok: boolean; error?: string } = { ok: true };
      try {
        await dataPost("/internal/valuation", { symbol });
      } catch (err) {
        valuation = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      return { ...warmed, valuation };
    }),
  );

  app.get("/data/valuation/:symbol", route("data.valuation", (c) => getLatestValuation(symbolOf(c))));
  app.get("/symbol/:symbol", route("symbol.trace", (c) => getSymbolTrace(symbolOf(c))));

  // Symbol autocomplete for the global command palette.
  app.get("/search", route("search", (c) => searchSymbols(qstr(c, "q") ?? "")));

  // Near-real-time quotes for live price ticking — forwarded to data's TTL-gated cache.
  app.get(
    "/quotes",
    route("quotes", (c) => {
      const symbols = (c.req.query("symbols") || "").trim();
      if (!symbols) return Promise.resolve({ quotes: [] as LiveQuote[] });
      return dataGet<{ quotes: LiveQuote[] }>(`/quotes?symbols=${encodeURIComponent(symbols)}`);
    }),
  );
}
