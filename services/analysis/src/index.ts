/**
 * Analysis service — the core. Receives events, reprices into trading signals via
 * the Agent SDK, persists them, and delivers to evaluation.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, type EventPayload } from "@qt/shared";
import { intakeEvent, processEvent, reprocessStuck } from "./pipeline.js";
import { redeliverPendingSignals } from "./deliver.js";
import { log } from "./log.js";

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
  log.info("event.received", {
    external_id: payload.external_id,
    symbol: payload.symbol,
    type: payload.event_type,
  });
  try {
    // Fast phase only — returns within the producer's delivery timeout.
    const intake = await intakeEvent(payload);
    if (intake.status !== "accepted") {
      // Terminal already (noise or duplicate): nothing to process.
      return c.json(ok(intake));
    }
    // ACK now; run the slow phase (valuation + LLM) in the background. A crash
    // here leaves the event `processing`; /internal/reprocess recovers it.
    const { event_id, norm } = intake;
    void processEvent(event_id, norm).catch((err) => {
      log.error("pipeline.async_failed", {
        event_id,
        symbol: norm.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return c.json(ok({ status: "accepted", event_id }), 202);
  } catch (err) {
    log.error("event.failed", {
      external_id: payload.external_id,
      symbol: payload.symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(fail("event_processing_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/internal/redeliver", async (c) => {
  try {
    const res = await redeliverPendingSignals();
    log.info("redeliver.done", { tried: res.tried, delivered: res.delivered });
    return c.json(ok(res));
  } catch (err) {
    log.error("redeliver.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("redeliver_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Recover events stuck in `processing` (background run died). Cron-triggered.
app.post("/internal/reprocess", async (c) => {
  try {
    const res = await reprocessStuck();
    log.info("reprocess.done", { tried: res.tried, recovered: res.recovered });
    return c.json(ok(res));
  } catch (err) {
    log.error("reprocess.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("reprocess_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
