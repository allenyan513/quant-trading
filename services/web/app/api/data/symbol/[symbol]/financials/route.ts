import { intParam, param } from "@/lib/api";
import { getFinancials } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute(async (req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  const period = param(req, "period") === "quarter" ? "quarter" : "annual";
  return getFinancials(symbol.toUpperCase(), { period, limit: intParam(req, "limit") ?? 8 });
});
