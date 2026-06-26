import { dataPost } from "@/lib/data-proxy";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";

/**
 * Page-open auto-refresh. web is read-only, so it forwards to the data service,
 * which warms the symbol's marketdata + recomputes the valuation in the background
 * (at most once per 24h). Fire-and-forget from the client; SWR polling surfaces the
 * fresher rows. Replaces the manual "Refresh data" button for the common case.
 */
export const POST = publicRoute(async (_req, ctx: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await ctx.params;
  return dataPost("/ensure", { symbol: symbol.toUpperCase() });
});
