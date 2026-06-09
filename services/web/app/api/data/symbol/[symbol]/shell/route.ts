import { handle } from "@/lib/api";
import { getCompanyShell } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  return handle(() => getCompanyShell(symbol.toUpperCase()));
}
