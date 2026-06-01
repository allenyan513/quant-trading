/**
 * Portfolio service — owns the paper book. It receives delivered trading signals
 * (forwarded from evaluation's outbox), deterministically sizes them, and is the
 * sole writer of the `positions` table. No LLM: sizing is a pure function.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, type TradingSignalDTO } from "@qt/shared";
import { sizeAndRecord } from "./portfolio.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "portfolio", status: "up" })));

// Intake: size a delivered signal and record the position (idempotent on signalId).
app.post("/signals", async (c) => {
  let s: TradingSignalDTO;
  try {
    s = (await c.req.json()) as TradingSignalDTO;
  } catch {
    return c.json(fail("bad_request", "invalid JSON body"), 400);
  }
  if (!s?.id) return c.json(fail("bad_request", "signal id required"), 400);
  try {
    const sizing = await sizeAndRecord(s);
    return c.json(ok({ signal: s.id, sizing }));
  } catch (err) {
    log.error("portfolio.size_failed", { signal: s.id, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("size_failed", err instanceof Error ? err.message : String(err)), 500);
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
