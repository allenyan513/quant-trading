import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

// The detail page's "Refresh data" refreshes everything shown for a symbol. web is
// read-only, so it forwards to the data service: data warms the marketdata caches
// + pulls news, then recomputes the reference valuation (the deterministic engine
// lives in data).
export async function POST(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle(async () => {
    const { symbol: raw } = await ctx.params;
    const symbol = raw.toUpperCase();

    // 1) Warm marketdata + news (required — this is what most tabs read).
    const warmed = await dataPost<object>("/warm", { symbol });

    // 2) Recompute the reference valuation from the freshly-warmed data. Best
    // effort: a symbol with too little history yields a price-only snapshot, and a
    // transient failure shouldn't fail the whole refresh — the marketdata tabs
    // already updated. Surface the outcome so the UI can hint.
    let valuation: { ok: boolean; error?: string } = { ok: true };
    try {
      await dataPost("/internal/valuation", { symbol });
    } catch (err) {
      valuation = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return { ...warmed, valuation };
  });
}
