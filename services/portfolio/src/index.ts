/**
 * Portfolio service — owns the paper book end to end. It receives delivered
 * trading signals from analysis, records them, deterministically sizes them into
 * positions, and settles open positions (target/stop/expiry → close). No LLM.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, db, dbSchema, type TradingSignalDTO } from "@qt/shared";
import { sizeAndRecord } from "./portfolio.js";
import { settlePositions } from "./track.js";
import { log } from "./log.js";

const { tradingSignals } = dbSchema;
const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "portfolio", status: "up" })));

// Intake: register the delivered signal (idempotent consumer-side safeguard;
// shared DB in v1) and size it into a position. A sizing rejection is a normal
// outcome and must not fail registration.
app.post("/signals", async (c) => {
  let s: TradingSignalDTO;
  try {
    s = (await c.req.json()) as TradingSignalDTO;
  } catch {
    return c.json(fail("bad_request", "invalid JSON body"), 400);
  }
  if (!s?.id) return c.json(fail("bad_request", "signal id required"), 400);
  try {
    await db()
      .insert(tradingSignals)
      .values({
        id: s.id,
        notificationId: s.notification_id,
        eventId: s.event_id,
        symbol: s.symbol,
        direction: s.direction,
        targetPrice: s.target_price,
        stopLoss: s.stop_loss,
        horizonDays: s.horizon_days,
        conviction: s.conviction,
        entryPrice: s.entry_price,
        fairValueBase: s.fair_value_base,
        deviationPct: s.deviation_pct,
        thesis: s.thesis,
        generatedBy: s.generated_by,
        snapshotId: s.snapshot_id,
        status: s.status,
        createdAt: new Date(s.created_at),
        expiresAt: s.expires_at ? new Date(s.expires_at) : null,
      })
      .onConflictDoNothing({ target: tradingSignals.id });
    log.info("signal.registered", { signal: s.id, symbol: s.symbol, direction: s.direction });

    const sizing = await sizeAndRecord(s);
    return c.json(ok({ registered: s.id, sizing }));
  } catch (err) {
    log.error("signal.register_failed", { signal: s.id, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("register_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

// Settle open positions (cron-triggered): close those that hit target/stop/expiry.
app.post("/jobs/track", async (c) => {
  try {
    const res = await settlePositions();
    log.info("track.done", { scanned: res.scanned, closed: res.closed });
    return c.json(ok(res));
  } catch (err) {
    log.error("track.failed", { error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("track_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
