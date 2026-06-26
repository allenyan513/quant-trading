/**
 * Data service — the sole receiver of external info. News-driven: `/news/pull`
 * stages market-wide FMP news; `/news/triage` screens + enriches per symbol;
 * a human promotes rows via `/news/notify`, which delivers an event to alpha
 * with outbox fallback. Plus the deterministic discovery scanner (`/scan/*`).
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { ok, fail, config, isAuthorizedJob, INCOME_CONCEPTS, marketdata } from "@qt/shared";
import { priorYear, settledPeriod } from "@qt/shared/xbrl-frames";
import { redeliverPending } from "./deliver.js";
import { scanEarnings } from "./scan/earnings.js";
import { scanFundamentals } from "./scan/fundamentals.js";
import { pullNewsFeed, NEWS_CATEGORIES, type NewsCategory } from "./pull/news-feed.js";
import { stageNews, notifyNews } from "./news.js";
import { triageNewsItems } from "./triage.js";
import { dismissCandidate } from "./candidates.js";
import { addWatchlist, removeWatchlist } from "./watchlist.js";
import { createList, renameList, deleteList, assignToList, reorderLists } from "./watchlist-lists.js";
import { submitMorningBrief } from "./morning-brief.js";
import { warmAndPullNews, revalue, ensureFresh } from "./refresh.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { sync13FAll, sync13FForFiler, setCusipMapping, resolveUnmappedCusips } from "./thirteenf/sync.js";
import { addFiler } from "./thirteenf/filers.js";
import { syncOwnershipAll, syncOwnershipForFiler } from "./ownership/sync.js";
import { addOwnershipFiler } from "./ownership/filers.js";
import { sync8KAll, sync8KForSymbol } from "./eightk/sync.js";
import { syncForm4All, syncForm4ForSymbol } from "./form4/sync.js";
import { searchFilings } from "@qt/shared/edgar-fts";
import { fetchMovers, fetchEarningsCalendar, fetchEconomicCalendar, fetchEarningsHistory } from "@qt/shared/markets";
import { syncEarningsCalendar } from "./earnings/sync.js";
import { route } from "./route.js";
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

// Per-user watchlist groups (data owns data_watchlist_lists, T12). web forwards
// create/rename/delete + symbol→list assignment with the session user's id.
app.post(
  "/watchlist/lists/create",
  route("watchlist.list.create", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!userId || !name) return c.json(fail("bad_request", "userId and name required"), 400);
    c.set("logContext", { userId });
    return createList(userId, name);
  }),
);

app.post(
  "/watchlist/lists/rename",
  route("watchlist.list.rename", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const id = String(body.id ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!userId || !id || !name) return c.json(fail("bad_request", "userId, id and name required"), 400);
    c.set("logContext", { userId });
    return renameList(userId, id, name);
  }),
);

app.post(
  "/watchlist/lists/delete",
  route("watchlist.list.delete", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const id = String(body.id ?? "").trim();
    if (!userId || !id) return c.json(fail("bad_request", "userId and id required"), 400);
    c.set("logContext", { userId });
    return deleteList(userId, id);
  }),
);

app.post(
  "/watchlist/lists/reorder",
  route("watchlist.list.reorder", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const ids = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)) : [];
    if (!userId || ids.length === 0) return c.json(fail("bad_request", "userId and ids required"), 400);
    c.set("logContext", { userId });
    return reorderLists(userId, ids);
  }),
);

app.post(
  "/watchlist/assign",
  route("watchlist.assign", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    if (!userId || !symbol) return c.json(fail("bad_request", "userId and symbol required"), 400);
    const listId = body.listId ? String(body.listId).trim() : null;
    c.set("logContext", { userId, symbol });
    return assignToList(userId, symbol, listId);
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
// can't reach FMP, so the "Refresh data" button forwards here. Deterministically
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

// Page-open auto-refresh: warm + revalue at most once per 24h, in the background.
// web fires this on opening a symbol (fire-and-forget) instead of the user clicking
// "Refresh data"; returns immediately (skipped if recently warmed). See refresh.ts.
app.post(
  "/ensure",
  route("ensure", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    c.set("logContext", { symbol });
    return ensureFresh(symbol);
  }),
);

// Near-real-time quotes (read-through cached, TTL-gated). web polls these during
// market hours to tick the watchlist + symbol-detail price. GET so web forwards
// via dataGet. ?symbols= is comma-separated (FMP isn't comma-batchable, so /quotes
// fans out individual gated calls under the global throttle).
app.get(
  "/quote",
  route("quote", async (c) => {
    const symbol = (c.req.query("symbol") ?? "").trim();
    if (!symbol) return c.json(fail("bad_request", "symbol required"), 400);
    return (await marketdata.getLiveQuote(symbol)) ?? { symbol: symbol.toUpperCase(), price: null };
  }),
);
app.get(
  "/quotes",
  route("quotes", async (c) => {
    const raw = (c.req.query("symbols") ?? "").trim();
    const symbols = raw
      ? [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 100)
      : [];
    return { quotes: await marketdata.getLiveQuotes(symbols) };
  }),
);

// (Live IBKR holdings — credentials / sync / jobs-sync-holdings — moved to the
// portfolio service: it owns the trading-accounts domain end to end, including its
// own external sync. data stays the cross-cutting *market* data hub.)

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

// ---- Earnings calendar enrich (Discover grid). Joins FMP earnings-calendar + profile
// (market cap / logo / sector) into data_earnings_calendar so the grid ranks the top-N
// by market cap. data owns the write; web reads the table directly (T12). #141. ----
async function syncEarnings(c: Context) {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const weeksAhead = Number(body.weeksAhead);
  const weeksBack = Number(body.weeksBack);
  return syncEarningsCalendar(
    Number.isFinite(weeksAhead) && weeksAhead > 0 ? weeksAhead : undefined,
    Number.isFinite(weeksBack) && weeksBack >= 0 ? weeksBack : undefined,
  );
}
app.post("/jobs/sync-earnings", route("earnings.sync", syncEarnings));
app.post("/earnings/sync", route("earnings.sync", syncEarnings));

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

// LiveTable paginates server-side via ?limit&offset (it fetches pageSize+1 to probe
// for a next page). The calendars return a bounded array, so honor it by slicing —
// without this, Next/Prev change the offset but the same first page is returned.
function paginate<T>(rows: T[], c: Context): T[] {
  const limit = Number(c.req.query("limit"));
  if (!Number.isFinite(limit) || limit <= 0) return rows;
  const offsetRaw = Number(c.req.query("offset"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  return rows.slice(offset, offset + limit);
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
    return c.json(ok(paginate(res, c)));
  } catch (err) {
    log.error("markets.earnings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_earnings_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

// Per-symbol beat/miss history for the earnings detail drawer (live FMP).
app.get("/markets/earnings-history", async (c) => {
  try {
    const symbol = (c.req.query("symbol") || "").trim().toUpperCase();
    if (!symbol) return c.json(fail("bad_request", "missing symbol"), 400);
    return c.json(ok(await fetchEarningsHistory(symbol)));
  } catch (err) {
    log.error("markets.earnings_history.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_earnings_history_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

app.get("/markets/economic-calendar", async (c) => {
  try {
    const win = calendarWindow(14);
    const res = await fetchEconomicCalendar(c.req.query("from") || win.from, c.req.query("to") || win.to);
    return c.json(ok(paginate(res, c)));
  } catch (err) {
    log.error("markets.economic.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("markets_economic_failed", err instanceof Error ? err.message : String(err)), 502);
  }
});

// Reference valuation (System A) — deterministic, no LLM. Lives in data (moved
// from alpha): it's computed from data-owned marketdata caches. alpha fetches it
// over HTTP as one input to its LLM repricing; the dashboard reads the snapshots.

// Per-symbol reference valuation — backs the detail page's "Refresh data" button + the
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

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
