import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";

/** Remove a symbol from the user's watchlist. Forwards to the data service (owner). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const { symbol } = await ctx.params;
    return dataPost("/watchlist/remove", { userId: uid, symbol });
  });
}
