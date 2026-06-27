/**
 * Per-user simulated paper account (ported from web's `app/api/paper/*`). All authed.
 * Reads come straight from the DB (`@qt/shared/paper-read`); writes (place/cancel/match/
 * reset) forward to the portfolio service with the SESSION user — never a client userId.
 */
import type { Hono } from "hono";
import { authed, readBody } from "../route.js";
import { portfolioPost } from "../portfolio-proxy.js";
import { getPaperAccount } from "@qt/shared/paper-read";
import { db } from "../db.js";

export function registerPaperRoutes(app: Hono): void {
  /** The signed-in user's paper account: cash, realized P&L, positions, blotter. */
  app.get("/paper/account", authed("paper.account", (_c, uid) => getPaperAccount(db(), uid)));

  /** Blotter — the user's recent paper orders (array, for LiveTable). */
  app.get("/paper/orders", authed("paper.orders", async (_c, uid) => (await getPaperAccount(db(), uid, { ordersLimit: 200 })).orders));

  /** Place a paper order (market or limit, optional thesis). Forward to portfolio. */
  app.post(
    "/paper/orders",
    authed("paper.orders.place", async (c, uid) => {
      const body = await readBody(c);
      return portfolioPost("/paper/orders", {
        userId: uid,
        symbol: String(body.symbol ?? ""),
        side: String(body.side ?? ""),
        quantity: Number(body.quantity),
        orderType: body.orderType != null ? String(body.orderType) : undefined,
        limitPrice: body.limitPrice != null ? Number(body.limitPrice) : undefined,
        tif: body.tif != null ? String(body.tif) : undefined,
        thesis: body.thesis != null ? String(body.thesis) : undefined,
        targetPrice: body.targetPrice != null ? Number(body.targetPrice) : undefined,
        stopPrice: body.stopPrice != null ? Number(body.stopPrice) : undefined,
        timeHorizon: body.timeHorizon != null ? String(body.timeHorizon) : undefined,
        source: "manual",
      });
    }),
  );

  /** Cancel a resting (working) paper limit order — scoped to the session user. */
  app.post(
    "/paper/orders/cancel",
    authed("paper.orders.cancel", async (c, uid) => {
      const body = await readBody(c);
      return portfolioPost("/paper/orders/cancel", { userId: uid, orderId: String(body.orderId ?? "") });
    }),
  );

  /** Match the user's resting limit orders against the live quote (triggered on page open). */
  app.post("/paper/match", authed("paper.match", (_c, uid) => portfolioPost("/paper/match", { userId: uid })));

  /** Reset the user's paper account (wipe positions + blotter, restore cash). */
  app.post("/paper/reset", authed("paper.reset", (_c, uid) => portfolioPost("/paper/reset", { userId: uid })));
}
