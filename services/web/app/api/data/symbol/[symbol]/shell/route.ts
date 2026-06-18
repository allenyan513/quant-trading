import { handle } from "@/lib/api";
import { getCompanyShell } from "@/lib/queries";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  // `inWatchlist` is per-user; fall back to "not in watchlist" if somehow unauth.
  const user = await getUser();
  return handle(() => getCompanyShell(symbol.toUpperCase(), user?.id));
}
