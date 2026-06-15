/**
 * Data service — the sole receiver of external info. News-driven: `/news/pull`
 * stages market-wide FMP news; `/news/triage` screens + enriches per symbol;
 * a human promotes rows via `/news/notify`, which delivers an event to alpha
 * with outbox fallback. Plus the deterministic discovery scanner (`/scan/*`).
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { ok, fail, config, isAuthorizedJob } from "@qt/shared";
import { redeliverPending } from "./deliver.js";
import { scanEarnings } from "./scan/earnings.js";
import { pullNewsFeed, NEWS_CATEGORIES, type NewsCategory } from "./pull/news-feed.js";
import { stageNews, notifyNews } from "./news.js";
import { triageNewsItems } from "./triage.js";
import { promoteCandidate, dismissCandidate, expireDiscoveryWatchlist } from "./candidates.js";
import { addToWatchlist, removeFromWatchlist } from "./watchlist.js";
import { warmAndPullNews, revalue, refreshWatchlist } from "./refresh.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { sweepWatchlistValuations } from "./valuation/sweep.js";
import { syncHoldings } from "./holdings/sync.js";
import { setHoldingsCredentials, HoldingsNotConnectedError } from "./holdings/credentials.js";
import { IBKRFlexError } from "@qt/shared";
import { StreamableHTTPTransport } from "@hono/mcp";
import { buildMcpServer } from "./mcp/server.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/health", (c) => c.json(ok({ service: "data", status: "up" })));

// Cron/job endpoints (e.g. the daily refresh hit by GitHub Actions) require a
// bearer matching JOB_TOKEN. Open locally when JOB_TOKEN is unset. /health stays
// public above this guard.
const jobAuth: MiddlewareHandler = async (c, next) => {
  if (!isAuthorizedJob(c.req.header("authorization"))) {
    return c.json(fail("unauthorized", "invalid or missing job token"), 401);
  }
  await next();
};
app.use("/jobs/*", jobAuth);

// MCP endpoint (Streamable HTTP) — lets Claude pull a symbol's research bundle via
// the get_symbol_research tool (proxies web's read-only /api/*). Stateless: a fresh
// server + transport per request. Open unless MCP_TOKEN is set.
app.all("/mcp", async (c) => {
  const tok = config.mcpToken();
  if (tok && c.req.header("authorization") !== `Bearer ${tok}`) {
    return c.json(fail("unauthorized", "invalid or missing mcp token"), 401);
  }
  const server = buildMcpServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return (await transport.handleRequest(c)) ?? c.body(null, 204);
});

// Fallback window for explicit/partial overrides and the scanner.
function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 3 * 24 * 3600 * 1000); // last 3 days
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ---- Manual news flow (issue #59): pull market-wide FMP news into staging,
// list it in the dashboard, then a human selects rows to push to alpha. ----

function newsWindow(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Pull (no symbol filter, bounded by window + page cap) -> stage in news_items.
// Does NOT deliver to alpha — that's the separate /news/notify step.
app.post("/news/pull", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const days = Number(body.days ?? 7);
    const win = newsWindow(Number.isFinite(days) && days > 0 ? days : 7);
    const requested = Array.isArray(body.categories) ? (body.categories as string[]) : NEWS_CATEGORIES;
    const categories = requested.filter((x): x is NewsCategory =>
      (NEWS_CATEGORIES as string[]).includes(x),
    );
    if (categories.length === 0) {
      return c.json(fail("bad_request", `categories must be a subset of ${NEWS_CATEGORIES.join(", ")}`), 400);
    }
    const maxPages = Number(body.maxPages ?? 5);
    const args = {
      from: (body.from as string) ?? win.from,
      to: (body.to as string) ?? win.to,
      maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 5,
      categories,
    };
    log.info("news.pull.start", { from: args.from, to: args.to, maxPages: args.maxPages, categories });
    const { items, byCategory } = await pullNewsFeed(args);
    const { pulled, inserted, insertedIds } = await stageNews(items);
    // Async ACK: hand the freshly-staged rows straight to triage in the
    // background and return now — triage is a slow LLM loop, so blocking the
    // pull on it would stall the request (and risk a gateway timeout). Failures
    // leave rows untriaged for the /news/triage cron sweep to retry. Mirrors
    // alpha's intake→background-process split.
    if (insertedIds.length > 0) {
      void triageNewsItems(insertedIds).catch((err) =>
        log.error("news.pull.triage_failed", { error: err instanceof Error ? err.message : String(err) }),
      );
    }
    log.info("news.pull.done", { pulled, inserted, byCategory });
    return c.json(ok({ pulled, inserted, queued: insertedIds.length, byCategory }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("news.pull.failed", { error: msg });
    return c.json(fail("news_pull_failed", msg), 500);
  }
});

// Screen + LLM-triage staged news (issue #59): deterministic rule pipeline first
// (market cap etc.), then the triage agent on survivors — it judges materiality/
// priority and warms the symbol's marketdata caches. Writes suggestions back onto
// the rows for human review. Empty body triages all untriaged `new` rows; pass
// `{ ids: [...] }` to (re)triage specific rows.
app.post("/news/triage", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : undefined;
    const res = await triageNewsItems(ids);
    return c.json(ok(res));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("news.triage.failed", { error: msg });
    return c.json(fail("news_triage_failed", msg), 500);
  }
});

// Push selected staged news rows to alpha (one notification per resolved symbol).
app.post("/news/notify", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) return c.json(fail("bad_request", "ids required"), 400);
    const symbolOverride =
      body.symbolOverride && typeof body.symbolOverride === "object"
        ? (body.symbolOverride as Record<string, string>)
        : {};
    const res = await notifyNews(ids, symbolOverride);
    return c.json(ok(res));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("news.notify.failed", { error: msg });
    return c.json(fail("news_notify_failed", msg), 500);
  }
});

app.post("/internal/redeliver", async (c) => {
  try {
    const res = await redeliverPending();
    log.info("redeliver.done", { tried: res.tried, delivered: res.delivered });
    return c.json(ok(res));
  } catch (err) {
    log.error("redeliver.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("redeliver_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// ---- Discovery / universe selection (deterministic, no LLM) ----

// Earnings-surprise scanner (cron): flag out-of-watchlist surprises as candidates.
app.post("/scan/earnings", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const win = defaultWindow();
    const res = await scanEarnings({
      from: (body.from as string) ?? win.from,
      to: (body.to as string) ?? win.to,
      minSurprisePct: (body.minSurprisePct as number | undefined) ?? config.scanEarningsSurprisePct(),
    });
    return c.json(ok(res));
  } catch (err) {
    log.error("scan.earnings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("scan_earnings_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Human review: promote a candidate into the watchlist, or dismiss it.
app.post("/candidates/promote", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  try {
    const res = await promoteCandidate(symbol);
    if (!res.promoted) return c.json(fail("not_found", `no candidate ${symbol.toUpperCase()}`), 404);
    return c.json(ok(res));
  } catch (err) {
    log.error("candidate.promote.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("promote_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/candidates/dismiss", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  try {
    const res = await dismissCandidate(symbol);
    if (!res.dismissed) return c.json(fail("not_found", `no candidate ${symbol.toUpperCase()}`), 404);
    return c.json(ok(res));
  } catch (err) {
    log.error("candidate.dismiss.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("dismiss_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Manual watchlist management (data owns the table, T12). Reads stay in web
// (it queries the DB directly with the valuation/position join).
app.post("/watchlist", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  try {
    const res = await addToWatchlist(symbol);
    // Auto-refresh a newly-added symbol so its detail page / the MCP aren't empty.
    // Await warm + news (deterministic, a few seconds, fills the caches readers
    // need); fire the valuation best-effort (the daily sweep is the backstop, and
    // blocking the add on an LLM repricing would make the button feel stuck).
    const refresh = await warmAndPullNews(symbol);
    void revalue(symbol);
    return c.json(ok({ ...res, refresh }));
  } catch (err) {
    log.error("watchlist.add.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("watchlist_add_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.delete("/watchlist/:symbol", async (c) => {
  const symbol = c.req.param("symbol").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  try {
    const res = await removeFromWatchlist(symbol);
    if (!res.removed) return c.json(fail("not_found", `not on watchlist: ${symbol.toUpperCase()}`), 404);
    return c.json(ok(res));
  } catch (err) {
    log.error("watchlist.remove.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("watchlist_remove_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// On-demand cache warming for the per-symbol detail page. web is read-only and
// can't reach FMP, so the "刷新数据" button forwards here. Deterministically
// read-through fills the symbol's marketdata caches (statements/ratios/prices/
// ratings/insider/pt) so the Chart/Financials tabs populate. Synchronous (a few
// FMP calls) — the caller shows a spinner. Reuses the triage warmer.
app.post("/warm", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  try {
    const res = await warmAndPullNews(symbol);
    return c.json(ok({ ...res, warmed: true }));
  } catch (err) {
    log.error("warm.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("warm_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Daily refresh (cron, JOB_TOKEN-guarded): full refresh of every watchlist
// symbol — warm marketdata caches + pull news + recompute valuation — so the
// dashboard and the MCP serve fresh data each market close. Synchronous; the
// caller (GitHub Actions) should allow a generous timeout for large watchlists.
app.post("/jobs/refresh-watchlist", async (c) => {
  try {
    const res = await refreshWatchlist();
    const warmed = res.results.filter((r) => r.warmed).length;
    const revalued = res.results.filter((r) => r.revalued).length;
    log.info("refresh.watchlist.done", { scanned: res.scanned, warmed, revalued });
    return c.json(ok({ scanned: res.scanned, warmed, revalued, results: res.results }));
  } catch (err) {
    log.error("refresh.watchlist.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("refresh_watchlist_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Save/update the IBKR Flex credentials (token + query id) for the configured
// account. Written here (data owns data_holdings_accounts); the web "Connect
// IBKR" form forwards to this endpoint so the dashboard stays read-only on DB.
app.post("/holdings/credentials", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      token?: unknown;
      queryId?: unknown;
      label?: unknown;
    };
    const token = typeof body.token === "string" ? body.token : "";
    const queryId = typeof body.queryId === "string" ? body.queryId : "";
    if (!token.trim() || !queryId.trim()) {
      return c.json(fail("bad_request", "token and queryId are required"), 400);
    }
    const res = await setHoldingsCredentials({
      token,
      queryId,
      label: typeof body.label === "string" ? body.label : undefined,
    });
    log.info("holdings.credentials.set", { accountId: res.accountId });
    return c.json(ok({ accountId: res.accountId, connected: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("holdings.credentials.failed", { error: msg });
    return c.json(fail("holdings_credentials_failed", msg), 500);
  }
});

// Sync the live IBKR Flex statement into the data_holdings_* tables (daily NAV,
// trades, positions) + warm the SPY benchmark. Idempotent. Two entry points,
// same body: `/jobs/sync-holdings` (cron, JOB_TOKEN) and `/holdings/sync`
// (the dashboard "refresh" button + the auto-sync after connecting).
async function runHoldingsSync(c: Context) {
  try {
    const res = await syncHoldings();
    log.info("holdings.sync.done", { ...res });
    return c.json(ok(res));
  } catch (err) {
    // Map credential / Flex failures to precise codes; everything else generic.
    const code =
      err instanceof HoldingsNotConnectedError
        ? "holdings_not_connected"
        : err instanceof IBKRFlexError
          ? `flex_${err.reason}`
          : "sync_holdings_failed";
    const status = err instanceof HoldingsNotConnectedError ? 400 : 500;
    const msg = err instanceof Error ? err.message : String(err);
    log.error("holdings.sync.failed", { code, error: msg });
    return c.json(fail(code, msg), status);
  }
}

app.post("/jobs/sync-holdings", (c) => runHoldingsSync(c));
app.post("/holdings/sync", (c) => runHoldingsSync(c));

// Reference valuation (System A) — deterministic, no LLM. Lives in data (moved
// from alpha): it's computed from data-owned marketdata caches. alpha fetches it
// over HTTP as one input to its LLM repricing; the dashboard reads the snapshots.

// Per-symbol reference valuation — backs the detail page's "刷新数据" button + the
// auto-refresh on watchlist add. forceRefresh: the caller just warmed marketdata.
app.post("/internal/valuation", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
  const forceRefresh = body.forceRefresh !== false; // default true (caller just warmed)
  try {
    const res = await computeReferenceValuation(symbol, { forceRefresh });
    return c.json(ok(res));
  } catch (err) {
    log.error("valuation.compute.failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("valuation_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Refresh the reference valuation for every watchlist symbol (cron/daily) so the
// dashboard's buy-zone view always has a fresh fair_value vs price.
app.post("/internal/valuation-sweep", async (c) => {
  try {
    const res = await sweepWatchlistValuations();
    return c.json(ok(res));
  } catch (err) {
    log.error("valuation.sweep.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("valuation_sweep_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Expiry sweep (cron): drop discovery-sourced watchlist entries past their TTL.
app.post("/internal/expire-watchlist", async (c) => {
  try {
    const res = await expireDiscoveryWatchlist();
    log.info("expire.done", { removed: res.removed });
    return c.json(ok(res));
  } catch (err) {
    log.error("expire.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("expire_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
