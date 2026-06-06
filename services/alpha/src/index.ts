/**
 * Alpha service — the core. Receives notifications, reprices into trading signals
 * via the Anthropic Messages API, persists them, and delivers to portfolio.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, type NotificationPayload } from "@qt/shared";
import { intakeNotification, processNotification, reprocessStuck } from "./pipeline.js";
import { redeliverPendingSignals } from "./deliver.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/health", (c) => c.json(ok({ service: "alpha", status: "up" })));

app.post("/notifications", async (c) => {
  let payload: NotificationPayload;
  try {
    payload = (await c.req.json()) as NotificationPayload;
  } catch {
    return c.json(fail("bad_request", "invalid JSON body"), 400);
  }
  if (!payload?.source || !payload?.batch_key) {
    return c.json(fail("bad_request", "source and batch_key are required"), 400);
  }
  log.info("notification.received", {
    batch_key: payload.batch_key,
    symbol: payload.symbol,
    type: payload.event_type,
    count: payload.events?.length ?? 0,
  });
  try {
    // Fast phase only — returns within the producer's delivery timeout.
    const intake = await intakeNotification(payload);
    if (intake.status !== "accepted") {
      // Terminal already (noise or duplicate): nothing to process.
      return c.json(ok(intake));
    }
    // ACK now; run the slow phase (valuation + LLM) in the background. A crash
    // here leaves the notification `processing`; /internal/reprocess recovers it.
    const { notification_id, norm } = intake;
    void processNotification(notification_id, norm).catch((err) => {
      log.error("pipeline.async_failed", {
        notification_id,
        symbol: norm.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return c.json(ok({ status: "accepted", notification_id }), 202);
  } catch (err) {
    log.error("notification.failed", {
      batch_key: payload.batch_key,
      symbol: payload.symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(fail("notification_processing_failed", err instanceof Error ? err.message : String(err)), 500);
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

// Recover notifications stuck in `processing` (background run died). Cron-triggered.
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
