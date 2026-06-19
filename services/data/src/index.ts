/**
 * Data service — the sole receiver of external info. News-driven: `/news/pull`
 * stages market-wide FMP news; `/news/triage` screens + enriches per symbol;
 * a human promotes rows via `/news/notify`, which delivers an event to alpha
 * with outbox fallback. Plus the deterministic discovery scanner (`/scan/*`).
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { ok, fail, config, isAuthorizedJob, INCOME_CONCEPTS } from "@qt/shared";
import { priorYear, settledPeriod } from "@qt/shared/xbrl-frames";
import { redeliverPending } from "./deliver.js";
import { scanEarnings } from "./scan/earnings.js";
import { scanFundamentals } from "./scan/fundamentals.js";
import { pullNewsFeed, NEWS_CATEGORIES, type NewsCategory } from "./pull/news-feed.js";
import { stageNews, notifyNews } from "./news.js";
import { triageNewsItems } from "./triage.js";
import { dismissCandidate } from "./candidates.js";
import { addWatchlist, removeWatchlist } from "./watchlist.js";
import { submitMorningBrief } from "./morning-brief.js";
import { warmAndPullNews, revalue } from "./refresh.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { syncHoldings, syncAllHoldings } from "./holdings/sync.js";
import { sync13FAll, sync13FForFiler, setCusipMapping, resolveUnmappedCusips } from "./thirteenf/sync.js";
import { addFiler } from "./thirteenf/filers.js";
import { syncOwnershipAll, syncOwnershipForFiler } from "./ownership/sync.js";
import { addOwnershipFiler } from "./ownership/filers.js";
import { sync8KAll, sync8KForSymbol } from "./eightk/sync.js";
import { syncForm4All, syncForm4ForSymbol } from "./form4/sync.js";
import { searchFilings } from "@qt/shared/edgar-fts";
import { fetchMovers, fetchEarningsCalendar, fetchEconomicCalendar } from "@qt/shared/markets";
import { route } from "./route.js";
import { setHoldingsCredentials, HoldingsNotConnectedError } from "./holdings/credentials.js";
import { IBKRFlexError } from "@qt/shared";
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

// (The MCP endpoint moved to services/web — web is the sole public ingress; data
// is internal. See services/web/app/api/[transport]/route.ts.)

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
app.post(
  "/news/pull",
  route("news.pull", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const days = Number(body.days ?? 7);
    const win = newsWindow(Number.isFinite(days) && days > 0 ? days : 7);
    const requested = Array.isArray(body.categories) ? (body.categories as string[]) : NEWS_CATEGORIES;
    const categories = requested.filter((x): x is NewsCategory => (NEWS_CATEGORIES as string[]).includes(x));
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
    // Async ACK: hand the freshly-staged rows straight to triage in the background
    // and return now — triage is a slow LLM loop, so blocking the pull on it would
    // stall the request. Failures leave rows untriaged for the /news/triage cron sweep.
    if (insertedIds.length > 0) {
      void triageNewsItems(insertedIds).catch((err) =>
        log.error("news.pull.triage_failed", { error: err instanceof Error ? err.message : String(err) }),
      );
    }
    log.info("news.pull.done", { pulled, inserted, byCategory });
    return { pulled, inserted, queued: insertedIds.length, byCategory };
  }),
);

// Screen + LLM-triage staged news (issue #59): deterministic rule pipeline first
// (market cap etc.), then the triage agent on survivors — it judges materiality/
// priority and warms the symbol's marketdata caches. Writes suggestions back onto
// the rows for human review. Empty body triages all untriaged `new` rows; pass
// `{ ids: [...] }` to (re)triage specific rows.
app.post(
  "/news/triage",
  route("news.triage", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : undefined;
    return triageNewsItems(ids);
  }),
);

// Push selected staged news rows to alpha (one notification per resolved symbol).
app.post(
  "/news/notify",
  route("news.notify", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) return c.json(fail("bad_request", "ids required"), 400);
    const symbolOverride =
      body.symbolOverride && typeof body.symbolOverride === "object" ? (body.symbolOverride as Record<string, string>) : {};
    return notifyNews(ids, symbolOverride);
  }),
);

app.post(
  "/internal/redeliver",
  route("redeliver", async () => {
    const res = await redeliverPending();
    log.info("redeliver.done", { tried: res.tried, delivered: res.delivered });
    return res;
  }),
);

// ---- Discovery / universe selection (deterministic, no LLM) ----

// Earnings-surprise scanner (cron): flag out-of-watchlist surprises as candidates.
app.post(
  "/scan/earnings",
  route("scan.earnings", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const win = defaultWindow();
    return scanEarnings({
      from: (body.from as string) ?? win.from,
      to: (body.to as string) ?? win.to,
      minSurprisePct: (body.minSurprisePct as number | undefined) ?? config.scanEarningsSurprisePct(),
    });
  }),
);

// XBRL Frames fundamental screener (#106): rank revenue YoY growth across ALL
// filers for a settled calendar quarter → out-of-universe discovery candidates.
app.post(
  "/scan/fundamentals",
  route("scan.fundamentals", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const period = typeof body.period === "string" ? body.period : settledPeriod(new Date());
    // Guard the user-supplied period so it can't build a garbage frame URL.
    if (!/^CY\d{4}Q[1-4]$/.test(period)) {
      return c.json(fail("bad_request", "period must look like CY2025Q3"), 400);
    }
    return scanFundamentals({
      period,
      agoPeriod: priorYear(period),
      concepts: INCOME_CONCEPTS.revenue ?? [],
      minBase: typeof body.minBase === "number" ? body.minBase : config.scanFundamentalsMinBase(),
      topN: typeof body.topN === "number" ? body.topN : config.scanFundamentalsTopN(),
      minGrowthPct: typeof body.minGrowthPct === "number" ? body.minGrowthPct : config.scanFundamentalsMinGrowthPct(),
    });
  }),
);

// SEVERED: candidate promotion is parked. Promote used to insert into the global
// house watchlist; the watchlist is per-user now, so there's no shared universe to
// promote into. Candidates stay a read-only discovery view until reconnected (see
// follow-up issue). 410 so the dashboard can surface it's disabled.
app.post("/candidates/promote", (c) =>
  c.json(fail("severed", "candidate promotion is disabled — watchlist is now per-user (see follow-up issue)"), 410),
);

app.post(
  "/candidates/dismiss",
  route("candidate.dismiss", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    c.set("logContext", { symbol });
    const res = await dismissCandidate(symbol);
    if (!res.dismissed) return c.json(fail("not_found", `no candidate ${symbol.toUpperCase()}`), 404);
    return res;
  }),
);

// Per-user watchlist (data owns data_watchlist, T12). web forwards add/remove with
// the session user's id; reads stay in web (DB-direct, scoped to the user, with the
// valuation/position join). The old house "universe" crons that read this table
// were SEVERED when it became per-user (see follow-up issue).
app.post(
  "/watchlist",
  route("watchlist.add", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    if (!userId || !symbol) return c.json(fail("bad_request", "userId and symbol required"), 400);
    const note = typeof body.note === "string" ? body.note : undefined;
    c.set("logContext", { userId, symbol });
    const res = await addWatchlist(userId, symbol, note);
    // Warm the newly-added symbol so its detail page / the MCP aren't empty. Await
    // warm + news (deterministic, a few seconds); fire the valuation best-effort so
    // the add button doesn't block on an LLM repricing. Per-symbol, not watchlist-wide.
    const refresh = await warmAndPullNews(symbol);
    void revalue(symbol);
    return { ...res, refresh };
  }),
);

app.post(
  "/watchlist/remove",
  route("watchlist.remove", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    if (!userId || !symbol) return c.json(fail("bad_request", "userId and symbol required"), 400);
    c.set("logContext", { userId, symbol });
    return removeWatchlist(userId, symbol);
  }),
);

// Morning brief (#97): the user's own Claude (skill + web search) generates the brief
// and posts it back via the OAuth MCP `submit_morning_brief` tool → web forwards here
// (T12). data just stores it — no LLM. Idempotent by (userId, date).
app.post(
  "/morning-brief/submit",
  route("morning_brief.submit", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const date = String(body.date ?? "").trim();
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    if (!userId || !date || !markdown.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json(fail("bad_request", "userId, valid date (YYYY-MM-DD) and markdown required"), 400);
    }
    const summary = body.summary && typeof body.summary === "object" ? body.summary : undefined;
    c.set("logContext", { userId, date });
    const res = await submitMorningBrief(userId, date, markdown, summary);
    log.info("morning_brief.submit", { userId, date });
    return res;
  }),
);

// On-demand cache warming for the per-symbol detail page. web is read-only and
// can't reach FMP, so the "刷新数据" button forwards here. Deterministically
// read-through fills the symbol's marketdata caches (statements/ratios/prices/
// ratings/insider/pt) so the Chart/Financials tabs populate. Synchronous (a few
// FMP calls) — the caller shows a spinner. Reuses the triage warmer.
app.post(
  "/warm",
  route("warm", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    c.set("logContext", { symbol });
    const res = await warmAndPullNews(symbol);
    return { ...res, warmed: true };
  }),
);

// SEVERED (cron, JOB_TOKEN-guarded): the daily full-watchlist refresh lost its
// driver when the watchlist became per-user (no global house universe to iterate).
// No-op so the GitHub Actions cron stays green; per-symbol warming still happens
// reactively (news triage) and on watchlist add. See follow-up issue.
app.post("/jobs/refresh-watchlist", (c) => c.json(ok({ severed: true, scanned: 0 })));

// Save/update the IBKR Flex credentials (token + query id) for the configured
// account. Written here (data owns data_holdings_accounts); the web "Connect
// IBKR" form forwards to this endpoint so the dashboard stays read-only on DB.
app.post(
  "/holdings/credentials",
  route("holdings.credentials", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { accountId?: unknown; token?: unknown; queryId?: unknown; label?: unknown };
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const queryId = typeof body.queryId === "string" ? body.queryId : "";
    if (!accountId.trim() || !token.trim() || !queryId.trim()) {
      return c.json(fail("bad_request", "accountId, token and queryId are required"), 400);
    }
    const res = await setHoldingsCredentials({ accountId, token, queryId, label: typeof body.label === "string" ? body.label : undefined });
    log.info("holdings.credentials.set", { accountId: res.accountId });
    return { accountId: res.accountId, connected: true };
  }),
);

// Sync the live IBKR Flex statement into the data_holdings_* tables (daily NAV,
// trades, positions) + warm the SPY benchmark. Idempotent. Two entry points,
// same body: `/jobs/sync-holdings` (cron, JOB_TOKEN) and `/holdings/sync`
// (the dashboard "refresh" button + the auto-sync after connecting).
async function runHoldingsSync(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return c.json(fail("bad_request", "accountId is required"), 400);
    const res = await syncHoldings(accountId);
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

// Cron (JOB_TOKEN): sync EVERY connected account. Per-account failure is skipped.
app.post(
  "/jobs/sync-holdings",
  route("holdings.sync.all", async () => {
    const res = await syncAllHoldings();
    log.info("holdings.sync.all.done", { synced: res.synced, failed: res.failed });
    return res;
  }),
);
// Manual (web forward): sync the signed-in user's account (accountId in body).
app.post("/holdings/sync", (c) => runHoldingsSync(c));

// ---- 13F — legendary investor quarterly holdings (SEC, free). data owns the
// data_13f_* tables; web reads them. Display only (parse + store); see #99. ----

// Sync every tracked manager's latest 13F filings. Two entry points, same body:
// `/jobs/sync-13f` (cron, JOB_TOKEN — quarterly cadence; 13F lands 45d after
// quarter end so frequent runs are cheap no-ops) and `/13f/sync` (manual; an
// optional `cik` syncs a single filer).
async function sync13F(c: Context) {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const cik = String(body.cik ?? "").trim();
  return cik ? sync13FForFiler(cik) : sync13FAll();
}
app.post("/jobs/sync-13f", route("13f.sync", sync13F));
app.post("/13f/sync", route("13f.sync", sync13F));

// Add/refresh a tracked manager (data owns the roster; mirrors /watchlist).
app.post(
  "/13f/filers",
  route("13f.filer.add", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const cik = String(body.cik ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!cik || !name) return c.json(fail("bad_request", "cik and name required"), 400);
    c.set("logContext", { cik });
    return addFiler({ cik, name, label: typeof body.label === "string" ? body.label : undefined });
  }),
);

// Backfill CUSIP→ticker via OpenFIGI for holdings still unmapped. Idempotent
// (only scans unmapped CUSIPs); `limit` bounds one run — call repeatedly for a
// large initial backfill. Folded into /13f/sync too, but exposed for on-demand.
app.post(
  "/13f/resolve-tickers",
  route("13f.resolve", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const limit = Number(body.limit ?? 1000);
    return resolveUnmappedCusips(Number.isFinite(limit) && limit > 0 ? limit : 1000);
  }),
);

// Self-maintained CUSIP→ticker mapping (manual override / supplement to OpenFIGI).
// Resolved at read time, so adding one enriches existing snapshots immediately.
app.post(
  "/13f/cusip-map",
  route("13f.cusip.map", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const cusip = String(body.cusip ?? "").trim();
    const ticker = String(body.ticker ?? "").trim();
    if (!cusip || !ticker) return c.json(fail("bad_request", "cusip and ticker required"), 400);
    c.set("logContext", { cusip });
    return setCusipMapping(cusip, ticker, typeof body.name === "string" ? body.name : undefined);
  }),
);

// ---- SEC 13D/13G beneficial ownership (symbol-centric companion to 13F). data
// owns data_ownership_* tables; web reads them. SEC-only (no FMP). See #105. ----

// Sync every tracked activist's SC 13D/13G filings. `/jobs/sync-ownership` (cron,
// JOB_TOKEN — daily is fine; accession-skip makes re-runs cheap) and
// `/ownership/sync` (manual; optional `cik` syncs a single filer).
async function syncOwnership(c: Context) {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const cik = String(body.cik ?? "").trim();
  return cik ? syncOwnershipForFiler(cik) : syncOwnershipAll();
}
app.post("/jobs/sync-ownership", route("ownership.sync", syncOwnership));
app.post("/ownership/sync", route("ownership.sync", syncOwnership));

// Add/refresh a tracked activist filer (data owns the roster; mirrors /13f/filers).
app.post(
  "/ownership/filers",
  route("ownership.filer.add", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const cik = String(body.cik ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!cik || !name) return c.json(fail("bad_request", "cik and name required"), 400);
    c.set("logContext", { cik });
    return addOwnershipFiler({ cik, name, label: typeof body.label === "string" ? body.label : undefined });
  }),
);

// ---- SEC 8-K material events (symbol-centric). data owns data_8k_filings; web reads.
// Item codes come structured from submissions (no doc parse). The 8-K → alpha repricing
// feed is a separate follow-up (#103 part 2). ----
// `/jobs/pull-8k` (cron, JOB_TOKEN — daily; accession-skip makes re-runs cheap) and
// `/eightk/pull` (manual; optional `symbol` pulls one).
async function sync8K(c: Context) {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  return symbol ? sync8KForSymbol(symbol) : sync8KAll();
}
app.post("/jobs/pull-8k", route("8k.sync", sync8K));
app.post("/eightk/pull", route("8k.sync", sync8K));

// ---- SEC Form 4 insider transactions (symbol-centric, direct from SEC). data owns
// data_form4; web reads (Ownership tab). Sole insider source — the legacy FMP
// `data_insider` cache was retired (#104/#132). ----
async function syncForm4(c: Context) {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const symbol = String(body.symbol ?? "").trim();
  return symbol ? syncForm4ForSymbol(symbol) : syncForm4All();
}
app.post("/jobs/pull-form4", route("form4.sync", syncForm4));
app.post("/form4/pull", route("form4.sync", syncForm4));

// ---- EDGAR full-text search (live passthrough; data is the sole external receiver,
// so web's MCP search_filings tool forwards here rather than calling efts itself). ----
app.post("/edgar/search", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const q = String(body.query ?? body.q ?? "").trim();
    if (!q) return c.json(fail("bad_request", "missing query"), 400);
    const forms = Array.isArray(body.forms) ? body.forms.filter((x: unknown): x is string => typeof x === "string") : undefined;
    const res = await searchFilings(q, {
      forms,
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      endDate: typeof body.endDate === "string" ? body.endDate : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return c.json(ok(res));
  } catch (err) {
    log.error("edgar.search.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("edgar_search_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

// ---- Discover live market snapshots (FMP passthrough; data is the sole external
// receiver, so web's /api/markets/* routes forward here). #141 Phase 2. ----
function calendarWindow(days: number): { from: string; to: string } {
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

app.get("/markets/movers", async (c) => {
  try {
    return c.json(ok(await fetchMovers()));
  } catch (err) {
    log.error("markets.movers.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_movers_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

app.get("/markets/earnings-calendar", async (c) => {
  try {
    const win = calendarWindow(14);
    const res = await fetchEarningsCalendar(c.req.query("from") || win.from, c.req.query("to") || win.to);
    return c.json(ok(res));
  } catch (err) {
    log.error("markets.earnings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_earnings_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

app.get("/markets/economic-calendar", async (c) => {
  try {
    const win = calendarWindow(14);
    const res = await fetchEconomicCalendar(c.req.query("from") || win.from, c.req.query("to") || win.to);
    return c.json(ok(res));
  } catch (err) {
    log.error("markets.economic.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_economic_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

// Reference valuation (System A) — deterministic, no LLM. Lives in data (moved
// from alpha): it's computed from data-owned marketdata caches. alpha fetches it
// over HTTP as one input to its LLM repricing; the dashboard reads the snapshots.

// Per-symbol reference valuation — backs the detail page's "刷新数据" button + the
// auto-refresh on watchlist add. forceRefresh: the caller just warmed marketdata.
app.post(
  "/internal/valuation",
  route("valuation.compute", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    const forceRefresh = body.forceRefresh !== false; // default true (caller just warmed)
    return computeReferenceValuation(symbol, { forceRefresh });
  }),
);

// SEVERED: the watchlist-wide valuation sweep lost its driver (house universe →
// per-user). No-op; per-symbol reference valuation is still at /internal/valuation.
// See follow-up issue.
app.post("/internal/valuation-sweep", (c) => c.json(ok({ severed: true, swept: 0 })));

// SEVERED: discovery TTL expiry is gone — the per-user watchlist has no source/TTL
// columns. No-op so any scheduler stays green. See follow-up issue.
app.post("/internal/expire-watchlist", (c) => c.json(ok({ severed: true, removed: 0 })));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
