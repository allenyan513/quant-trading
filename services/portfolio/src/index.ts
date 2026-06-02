/**
 * Portfolio service — owns the paper book end to end. It receives delivered
 * trading signals from alpha and acts on its book: open a new position, close
 * an existing one when the view turns bearish (re-decision), or settle open
 * positions on target/stop/expiry (/jobs/track). No LLM.
 *
 * Ownership (T12): alpha is the sole creator of `trading_signals` (it writes
 * the row before delivering). Portfolio never inserts signals — it owns
 * `positions` and only mirrors lifecycle onto `trading_signals.status`.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ok, fail, config, type TradingSignalDTO } from "@qt/shared";
import { handleSignal } from "./portfolio.js";
import { settlePositions } from "./track.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/healthz", (c) => c.json(ok({ service: "portfolio", status: "up" })));

// Intake: act on a delivered signal against the book (open / close / hold /
// reject). A non-open outcome (e.g. reject, held) is normal, not an error.
app.post("/signals", async (c) => {
  let s: TradingSignalDTO;
  try {
    s = (await c.req.json()) as TradingSignalDTO;
  } catch {
    return c.json(fail("bad_request", "invalid JSON body"), 400);
  }
  if (!s?.id) return c.json(fail("bad_request", "signal id required"), 400);
  try {
    const outcome = await handleSignal(s);
    return c.json(ok({ signal: s.id, outcome }));
  } catch (err) {
    log.error("signal.handle_failed", { signal: s.id, error: err instanceof Error ? err.message : String(err) });
    return c.json(fail("handle_failed", err instanceof Error ? err.message : String(err)), 500);
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
