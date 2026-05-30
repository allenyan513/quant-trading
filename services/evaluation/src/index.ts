/**
 * Evaluation service — settles signal outcomes (deterministic) and critiques them
 * (LLM), writing lessons into the feedback store that analysis reads back.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, db, dbSchema, type TradingSignalDTO } from "@qt/shared";
import { trackOutcomes } from "./track.js";
import { critiqueResolved } from "./critique.js";

const { tradingSignals } = dbSchema;
const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "evaluation", status: "up" })));

// Intake: register a delivered signal for tracking (idempotent; shared DB in v1).
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
    return c.json(ok({ registered: s.id }));
  } catch (err) {
    return c.json(fail("register_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/jobs/track", async (c) => {
  try {
    return c.json(ok(await trackOutcomes()));
  } catch (err) {
    return c.json(fail("track_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

app.post("/jobs/critique", async (c) => {
  try {
    return c.json(ok(await critiqueResolved()));
  } catch (err) {
    return c.json(fail("critique_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[evaluation] listening on :${info.port}`);
});
