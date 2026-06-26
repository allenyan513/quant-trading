import { db } from "@/lib/db";
import { getPaperAccount } from "@qt/shared/paper-read";
import { portfolioPost } from "@/lib/portfolio-proxy";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blotter — the signed-in user's recent paper orders (array, for LiveTable). */
export const GET = authedRoute(async (uid) => (await getPaperAccount(db(), uid, { ordersLimit: 200 })).orders);

/** Place a paper order (market or limit, optional thesis). web is read-only, so it
 *  forwards to the portfolio service with the SESSION user (never a client userId). */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody(req);
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
});
