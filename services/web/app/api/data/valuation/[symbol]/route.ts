import { getLatestValuation } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute(async (_req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  return getLatestValuation(symbol.toUpperCase());
});
