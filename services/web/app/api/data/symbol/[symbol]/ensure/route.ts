import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

/**
 * Page-open auto-refresh. web is read-only, so it forwards to the data service,
 * which warms the symbol's marketdata + recomputes the valuation in the background
 * (at most once per 24h). Fire-and-forget from the client; SWR polling surfaces the
 * fresher rows. Replaces the manual "Refresh data" button for the common case.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle(async () => {
    const { symbol } = await ctx.params;
    return dataPost("/ensure", { symbol: symbol.toUpperCase() });
  });
}
