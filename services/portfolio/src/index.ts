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
import type { Context, MiddlewareHandler } from "hono";
import { ok, fail, config, isAuthorizedJob, IBKRFlexError, type TradingSignalDTO } from "@qt/shared";
import { handleSignal } from "./strategy.js";
import { settlePositions } from "./track.js";
import { createPaperOrder, matchWorkingOrders, cancelPaperOrder, resetPaperAccount, type OrderSide, type OrderType, type OrderSource, type Tif } from "./paper.js";
import { syncHoldings, syncAllHoldings } from "./holdings/sync.js";
import { setHoldingsCredentials, HoldingsNotConnectedError } from "./holdings/credentials.js";
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
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    const side = String(body.side ?? "").trim().toLowerCase();
    const quantity = Number(body.quantity);
    const orderType = String(body.orderType ?? "market").trim().toLowerCase();
    const tif = String(body.tif ?? "gtc").trim().toLowerCase();
    const limitPrice = body.limitPrice != null ? Number(body.limitPrice) : null;
    const source: OrderSource = String(body.source ?? "manual").trim().toLowerCase() === "mcp" ? "mcp" : "manual";
    const idempotencyKey = body.idempotencyKey != null ? String(body.idempotencyKey) : null;
    if (!userId || !symbol) return c.json(fail("bad_request", "userId and symbol required"), 400);
    if (side !== "buy" && side !== "sell") return c.json(fail("bad_request", "side must be buy or sell"), 400);
    if (!Number.isFinite(quantity) || quantity <= 0) return c.json(fail("bad_request", "quantity must be > 0"), 400);
    if (orderType !== "market" && orderType !== "limit") return c.json(fail("bad_request", "orderType must be market or limit"), 400);
    if (tif !== "day" && tif !== "gtc") return c.json(fail("bad_request", "tif must be day or gtc"), 400);
    if (orderType === "limit" && (limitPrice == null || !Number.isFinite(limitPrice) || limitPrice <= 0))
      return c.json(fail("bad_request", "limit order requires a positive limitPrice"), 400);
    c.set("logContext", { userId, symbol, side, quantity, order_type: orderType });
    return createPaperOrder({
      userId,
      symbol,
      side: side as OrderSide,
      quantity,
      source,
      orderType: orderType as OrderType,
      limitPrice,
      tif: tif as Tif,
      idempotencyKey,
      thesis: body.thesis != null ? String(body.thesis) : null,
      targetPrice: body.targetPrice != null ? Number(body.targetPrice) : null,
      stopPrice: body.stopPrice != null ? Number(body.stopPrice) : null,
      timeHorizon: body.timeHorizon != null ? String(body.timeHorizon) : null,
    });
  }),
);

// Cancel a resting (working) order — a limit order or a queued market order.
app.post(
  "/paper/orders/cancel",
  route("paper.cancel", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? "").trim();
    const orderId = String(body.orderId ?? "").trim();
    if (!userId || !orderId) return c.json(fail("bad_request", "userId and orderId required"), 400);
    c.set("logContext", { userId, order_id: orderId });
    return cancelPaperOrder(userId, orderId);
  }),
);

// Match the user's resting working orders against the live quote (triggered on page
// open / account read — no background cron). Idempotent: fills crossing limit orders +
// queued market orders once the quote is fresh again.
app.post(
  "/paper/match",
  route("paper.match", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? "").trim();
    if (!userId) return c.json(fail("bad_request", "userId required"), 400);
    c.set("logContext", { userId });
    return matchWorkingOrders(userId);
  }),
);

app.post(
  "/paper/reset",
  route("paper.reset", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? "").trim();
    if (!userId) return c.json(fail("bad_request", "userId required"), 400);
    c.set("logContext", { userId });
    return resetPaperAccount(userId);
  }),
);

// ---- Live IBKR account (Flex sync) — owned by portfolio (the trading-accounts
// domain owns its own external sync). Moved from the data service. ----

// JOB_TOKEN guard for the holdings cron (mirrors data's jobAuth; open locally when
// JOB_TOKEN is unset). Scoped to /jobs/sync-holdings so /jobs/track is unchanged.
const jobAuth: MiddlewareHandler = async (c, next) => {
  if (!isAuthorizedJob(c.req.header("authorization"))) {
    return c.json(fail("unauthorized", "invalid or missing job token"), 401);
  }
  await next();
};
app.use("/jobs/sync-holdings", jobAuth);

// Save/update the IBKR Flex credentials (token + query id) for the configured
// account. web's "Connect IBKR" form forwards here so the dashboard stays read-only.
app.post(
  "/holdings/credentials",
  route("holdings.credentials", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { accountId?: unknown; token?: unknown; queryId?: unknown; label?: unknown };
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const queryId = typeof body.queryId === "string" ? body.queryId : "";
    if (!accountId.trim() || !token.trim() || !queryId.trim()) {
      return c.json(fail("bad_request", "accountId, token and queryId are required"), 400);
    }
    const res = await setHoldingsCredentials({ accountId, token, queryId, label: typeof body.label === "string" ? body.label : undefined });
    log.info("holdings.credentials.set", { accountId: res.accountId });
    return { accountId: res.accountId, connected: true };
  }),
);

// Sync the live IBKR Flex statement into the portfolio_holdings_* tables (daily NAV,
// trades, positions) + warm the SPY benchmark. Idempotent. Two entry points, same
// body: `/jobs/sync-holdings` (cron, JOB_TOKEN) and `/holdings/sync` (the dashboard
// "refresh" button + the auto-sync after connecting).
async function runHoldingsSync(c: Context) {
  try {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return c.json(fail("bad_request", "accountId is required"), 400);
    const res = await syncHoldings(accountId);
    log.info("holdings.sync.done", { ...res });
    return c.json(ok(res));
  } catch (err) {
    // Map credential / Flex failures to precise codes; everything else generic.
    const code =
      err instanceof HoldingsNotConnectedError
        ? "holdings_not_connected"
        : err instanceof IBKRFlexError
          ? `flex_${err.reason}`
          : "sync_holdings_failed";
    const status = err instanceof HoldingsNotConnectedError ? 400 : 500;
    const msg = err instanceof Error ? err.message : String(err);
    log.error("holdings.sync.failed", { code, error: msg });
    return c.json(fail(code, msg), status);
  }
}

// Cron (JOB_TOKEN): sync EVERY connected account. Per-account failure is skipped.
app.post(
  "/jobs/sync-holdings",
  route("holdings.sync.all", async () => {
    const res = await syncAllHoldings();
    log.info("holdings.sync.all.done", { synced: res.synced, failed: res.failed });
    return res;
  }),
);
// Manual (web forward): sync the signed-in user's account (accountId in body).
app.post("/holdings/sync", (c) => runHoldingsSync(c));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("listening", { port: info.port });
});
