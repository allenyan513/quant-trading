/**
 * Ingestion service — the sole receiver of external info. v1: scheduled pull
 * only. Cloud Scheduler hits /pull/* on a cron; each pulled item becomes an
 * event, persisted (dedup) and delivered to analysis with outbox fallback.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config } from "@qt/shared";
import { ingestAndDeliverAll, redeliverPending } from "./deliver.js";
import { pullEarnings } from "./pull/earnings.js";
import { pullRatings } from "./pull/ratings.js";
import { pullNews } from "./pull/news.js";
import { getWatchlistSymbols } from "./watchlist.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "ingestion", status: "up" })));

function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 3 * 24 * 3600 * 1000); // last 3 days
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

app.post("/pull/earnings", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    // Default the earnings-calendar filter to the watchlist when none given.
    const symbols = (body.symbols as string[] | undefined) ?? (await getWatchlistSymbols());
    const win = {
      from: (body.from as string) ?? defaultWindow().from,
      to: (body.to as string) ?? defaultWindow().to,
      symbols: symbols.length > 0 ? symbols : undefined,
    };
    log.info("pull.earnings.start", { from: win.from, to: win.to, symbols: win.symbols?.length ?? "all" });
    const payloads = await pullEarnings(win);
    log.info("pull.earnings.fetched", { events: payloads.length });
    const delivered = await ingestAndDeliverAll(payloads);
    log.info("pull.earnings.done", { pulled: payloads.length, delivered });
    return c.json(ok({ pulled: payloads.length, delivered }));
  } catch (err) {
    log.error("pull.earnings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("pull_earnings_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/pull/ratings", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    // Default to the watchlist when the caller doesn't pin specific symbols.
    const symbols = (body.symbols as string[] | undefined) ?? (await getWatchlistSymbols());
    if (symbols.length === 0) {
      return c.json(fail("empty_watchlist", "seed the watchlist first (pnpm seed:watchlist)"), 400);
    }
    log.info("pull.ratings.start", { symbols: symbols.length });
    const payloads = await pullRatings(symbols);
    log.info("pull.ratings.fetched", { events: payloads.length });
    const delivered = await ingestAndDeliverAll(payloads);
    log.info("pull.ratings.done", { pulled: payloads.length, delivered });
    return c.json(ok({ pulled: payloads.length, delivered }));
  } catch (err) {
    log.error("pull.ratings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("pull_ratings_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/pull/news", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const symbols = (body.symbols as string[] | undefined) ?? (await getWatchlistSymbols());
    if (symbols.length === 0) {
      return c.json(fail("empty_watchlist", "seed the watchlist first (pnpm seed:watchlist)"), 400);
    }
    const win = {
      from: (body.from as string) ?? defaultWindow().from,
      to: (body.to as string) ?? defaultWindow().to,
      symbols,
      limit: body.limit as number | undefined,
    };
    log.info("pull.news.start", { from: win.from, to: win.to, symbols: symbols.length });
    const payloads = await pullNews(win);
    log.info("pull.news.fetched", { events: payloads.length });
    const delivered = await ingestAndDeliverAll(payloads);
    log.info("pull.news.done", { pulled: payloads.length, delivered });
    return c.json(ok({ pulled: payloads.length, delivered }));
  } catch (err) {
    log.error("pull.news.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("pull_news_failed", err instanceof Error ? err.message : String(err)), 500);
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

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
