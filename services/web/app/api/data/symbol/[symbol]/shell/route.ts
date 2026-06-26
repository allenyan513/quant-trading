import { getCompanyShell } from "@/lib/queries";
import { publicRoute } from "@/lib/route";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute(async (_req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  // `inWatchlist` is per-user; fall back to "not in watchlist" if somehow unauth.
  const user = await getUser();
  return getCompanyShell(symbol.toUpperCase(), user?.id);
});
