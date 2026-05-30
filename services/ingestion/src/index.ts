/**
 * Ingestion service — the sole receiver of external info. v1: scheduled pull
 * only. Cloud Scheduler hits /pull/* on a cron; each pulled item becomes an
 * event, persisted (dedup) and delivered to analysis with outbox fallback.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config } from "@qt/shared";
import { ingestAndDeliver, redeliverPending } from "./deliver.js";
import { pullEarnings } from "./pull/earnings.js";
import { pullRatings } from "./pull/ratings.js";
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
    const win = {
      from: (body.from as string) ?? defaultWindow().from,
      to: (body.to as string) ?? defaultWindow().to,
      symbols: body.symbols as string[] | undefined,
    };
    log.info("pull.earnings.start", { from: win.from, to: win.to, symbols: win.symbols?.length ?? "all" });
    const payloads = await pullEarnings(win);
    log.info("pull.earnings.fetched", { events: payloads.length });
    const results = [];
    for (const p of payloads) results.push(await ingestAndDeliver(p));
    const delivered = results.filter((r) => r.delivered).length;
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
    const symbols = (body.symbols as string[] | undefined) ?? [];
    if (symbols.length === 0) {
      return c.json(fail("missing_symbols", "ratings pull requires { symbols: [...] }"), 400);
    }
    log.info("pull.ratings.start", { symbols: symbols.length });
    const payloads = await pullRatings(symbols);
    log.info("pull.ratings.fetched", { events: payloads.length });
    const results = [];
    for (const p of payloads) results.push(await ingestAndDeliver(p));
    const delivered = results.filter((r) => r.delivered).length;
    log.info("pull.ratings.done", { pulled: payloads.length, delivered });
    return c.json(ok({ pulled: payloads.length, delivered }));
  } catch (err) {
    log.error("pull.ratings.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("pull_ratings_failed", err instanceof Error ? err.message : String(err)), 500);
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
