import { authedRoute, readBody } from "@/lib/route";
import { portfolioPost } from "@/lib/portfolio-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cancel a resting (working) paper limit order. Forwards to portfolio with the
 *  SESSION user so a client can only cancel their own orders. */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody(req);
  return portfolioPost("/paper/orders/cancel", { userId: uid, orderId: String(body.orderId ?? "") });
});
