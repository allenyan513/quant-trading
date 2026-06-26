import { intParam } from "@/lib/api";
import { getPrices } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  return getPrices(symbol.toUpperCase(), { days: intParam(req, "days") ?? 800 });
});
