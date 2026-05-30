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
    const payloads = await pullEarnings(win);
    const results = [];
    for (const p of payloads) results.push(await ingestAndDeliver(p));
    return c.json(ok({ pulled: payloads.length, delivered: results.filter((r) => r.delivered).length }));
  } catch (err) {
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
    const payloads = await pullRatings(symbols);
    const results = [];
    for (const p of payloads) results.push(await ingestAndDeliver(p));
    return c.json(ok({ pulled: payloads.length, delivered: results.filter((r) => r.delivered).length }));
  } catch (err) {
    return c.json(fail("pull_ratings_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/internal/redeliver", async (c) => {
  try {
    const res = await redeliverPending();
    return c.json(ok(res));
  } catch (err) {
    return c.json(fail("redeliver_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[ingestion] listening on :${info.port}`);
});
