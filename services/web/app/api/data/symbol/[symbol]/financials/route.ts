import { handle, intParam, param } from "@/lib/api";
import { getFinancials } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const period = param(req, "period") === "quarter" ? "quarter" : "annual";
  return handle(() => getFinancials(symbol.toUpperCase(), { period, limit: intParam(req, "limit") ?? 8 }));
}
