import { handle, intParam } from "@/lib/api";
import { getPrices } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  return handle(() => getPrices(symbol.toUpperCase(), { days: intParam(req, "days") ?? 800 }));
}
