import { dataPost } from "@/lib/data-proxy";
import { authedRoute } from "@/lib/route";

export const runtime = "nodejs";

/** Remove a symbol from the user's watchlist. Forwards to the data service (owner). */
export const DELETE = authedRoute(async (uid, _req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  return dataPost("/watchlist/remove", { userId: uid, symbol });
});
