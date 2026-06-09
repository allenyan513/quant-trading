import { handle } from "@/lib/api";

export const runtime = "nodejs";

// Caches are owned by data (T12) and warming needs FMP, which web can't reach.
// Forward the on-demand warm to the data service (same pattern as watchlist
// writes). Static process.env.DATA_URL (Next inlines it).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

export async function POST(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle(async () => {
    const { symbol } = await ctx.params;
    const resp = await fetch(`${dataUrl()}/warm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: symbol.toUpperCase() }),
    });
    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
    if (!resp.ok || !json.ok) throw new Error(json.error ?? `data service returned ${resp.status}`);
    return json.data;
  });
}
