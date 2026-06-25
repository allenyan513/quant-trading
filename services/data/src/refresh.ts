/**
 * Per-symbol data refresh — the server-side equivalent of the dashboard's
 * "Refresh data" button (which orchestrates the same owners, T12):
 *
 *   warm marketdata caches (data) + pull recent news (data) + recompute the
 *   reference valuation (data, /internal/valuation).
 *
 * Entry points: the per-symbol `/warm` endpoint (web button — warm + news only)
 * and the auto-refresh when a symbol is added to a watchlist (warm + news awaited,
 * valuation fired best-effort).
 *
 * NOTE: the old daily `/jobs/refresh-watchlist` cron that iterated the whole house
 * watchlist was SEVERED when the watchlist became per-user (see follow-up issue) —
 * only these per-symbol primitives remain. Reactive coverage still comes from news
 * triage warming and on-add warming.
 *
 * Every step is isolated: one failed dataset (e.g. a premium-gated statement, or
 * alpha being briefly unreachable) must never abort the rest.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema } from "@qt/shared";
import { warmSymbol } from "./warm.js";
import { pullSymbolNews } from "./pull/news-feed.js";
import { stageNews } from "./news.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { log } from "./log.js";

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const { marketdataFetches } = dbSchema;

// "Ensure fresh" gate: re-warm a symbol's full marketdata at most once per day.
// We reuse the per-(symbol,dataset) fetch watermark with a synthetic dataset so
// the page-open auto-refresh is a cheap no-op when the symbol was warmed recently.
const WARM_DATASET = "warm";
const WARM_TTL_MS = 24 * 60 * 60 * 1000;

/** Warm the symbol's marketdata caches + pull its recent news. Deterministic
 *  (no LLM), typically a few seconds. Each step isolated. */
export async function warmAndPullNews(
  symbol: string,
): Promise<{ symbol: string; warmed: boolean; newsPulled: number; newsInserted: number }> {
  const sym = symbol.toUpperCase();
  let warmed = false;
  try {
    await warmSymbol(sym);
    warmed = true;
  } catch (err) {
    log.warn("refresh.warm_failed", { symbol: sym, error: msg(err) });
  }

  // Market-wide /news/pull leaves single tickers stale, so pull this symbol's
  // news explicitly. Isolated: a news failure must not fail the marketdata warm.
  let newsPulled = 0;
  let newsInserted = 0;
  try {
    const items = await pullSymbolNews(sym, { days: 30 });
    newsPulled = items.length;
    newsInserted = (await stageNews(items)).inserted;
  } catch (err) {
    log.warn("refresh.news_failed", { symbol: sym, error: msg(err) });
  }

  return { symbol: sym, warmed, newsPulled, newsInserted };
}

/** Recompute the reference valuation (deterministic, data-local since the engine
 *  moved here from alpha). forceRefresh: the caller just warmed the marketdata.
 *  Best-effort: never throws. */
export async function revalue(symbol: string): Promise<boolean> {
  const sym = symbol.toUpperCase();
  try {
    await computeReferenceValuation(sym, { forceRefresh: true });
    return true;
  } catch (err) {
    log.warn("refresh.revalue_failed", { symbol: sym, error: msg(err) });
    return false;
  }
}

/**
 * Page-open auto-refresh: warm + pull news + revalue a symbol, but at most once
 * per 24h (the manual "Refresh data" button is gone). Returns immediately —
 * `skipped` if warmed within the TTL, else `started` with the work kicked off in
 * the BACKGROUND (Cloud Run keeps the instance alive after the response). The
 * watermark is stamped up-front so concurrent opens don't stack warms; per-dataset
 * freshness gates still suppress redundant FMP calls inside the warm.
 */
export async function ensureFresh(symbol: string): Promise<{ symbol: string; status: "skipped" | "started" }> {
  const sym = symbol.toUpperCase();
  const wm = await db()
    .select({ fetchedAt: marketdataFetches.fetchedAt })
    .from(marketdataFetches)
    .where(and(eq(marketdataFetches.symbol, sym), eq(marketdataFetches.dataset, WARM_DATASET)));
  const fetchedAt = wm[0]?.fetchedAt ?? null;
  if (fetchedAt && Date.now() - fetchedAt.getTime() <= WARM_TTL_MS) {
    return { symbol: sym, status: "skipped" };
  }
  // Stamp first (dedupe concurrent opens within the window), then warm in the background.
  const now = new Date();
  await db()
    .insert(marketdataFetches)
    .values({ symbol: sym, dataset: WARM_DATASET, fetchedAt: now })
    .onConflictDoUpdate({ target: [marketdataFetches.symbol, marketdataFetches.dataset], set: { fetchedAt: now } });
  void warmAndPullNews(sym)
    .then(() => revalue(sym))
    .catch((err) => log.warn("refresh.ensure_failed", { symbol: sym, error: msg(err) }));
  return { symbol: sym, status: "started" };
}
