/**
 * Analysis service — the core. Receives events, reprices into trading signals via
 * the Agent SDK, persists them, and delivers to evaluation.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, type EventPayload } from "@qt/shared";
import { runEvent } from "./pipeline.js";
import { redeliverPendingSignals } from "./deliver.js";

const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "analysis", status: "up" })));

app.post("/events", async (c) => {
  let payload: EventPayload;
  try {
    payload = (await c.req.json()) as EventPayload;
  } catch {
    return c.json(fail("bad_request", "invalid JSON body"), 400);
  }
  if (!payload?.source || !payload?.external_id) {
    return c.json(fail("bad_request", "source and external_id are required"), 400);
  }
  try {
    const result = await runEvent(payload);
    return c.json(ok(result));
  } catch (err) {
    return c.json(fail("event_processing_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/internal/redeliver", async (c) => {
  try {
    return c.json(ok(await redeliverPendingSignals()));
  } catch (err) {
    return c.json(fail("redeliver_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[analysis] listening on :${info.port}`);
});
