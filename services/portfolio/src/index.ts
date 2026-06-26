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
import { createPaperOrder, resetPaperAccount, type OrderSide, type OrderSource } from "./paper.js";
import { route } from "./route.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/health", (c) => c.json(ok({ service: "portfolio", status: "up" })));

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
app.post(
  "/jobs/track",
  route("track", async () => {
    const res = await settlePositions();
    log.info("track.done", { scanned: res.scanned, closed: res.closed });
    return res;
  }),
);

// ---- Paper trading (per-user, order-driven) ----
// web forwards order placement here (it's read-only on the DB); `userId` comes from
// web's session / the MCP bearer token, never from raw client input. Internal-only,
// same trust model as alpha->portfolio /signals.

app.post(
  "/paper/orders",
  route("paper.order", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    const side = String(body.side ?? "").trim().toLowerCase();
    const quantity = Number(body.quantity);
    const source: OrderSource = String(body.source ?? "manual").trim().toLowerCase() === "mcp" ? "mcp" : "manual";
    const idempotencyKey = body.idempotencyKey != null ? String(body.idempotencyKey) : null;
    if (!userId || !symbol) return c.json(fail("bad_request", "userId and symbol required"), 400);
    if (side !== "buy" && side !== "sell") return c.json(fail("bad_request", "side must be buy or sell"), 400);
    if (!Number.isFinite(quantity) || quantity <= 0) return c.json(fail("bad_request", "quantity must be > 0"), 400);
    c.set("logContext", { userId, symbol, side, quantity });
    return createPaperOrder(userId, symbol, side as OrderSide, quantity, source, idempotencyKey);
  }),
);

app.post(
  "/paper/reset",
  route("paper.reset", async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const userId = String(body.userId ?? "").trim();
    if (!userId) return c.json(fail("bad_request", "userId required"), 400);
    c.set("logContext", { userId });
    return resetPaperAccount(userId);
  }),
);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
