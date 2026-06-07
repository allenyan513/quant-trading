import { handle } from "@/lib/api";

export const runtime = "nodejs";

function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Remove a symbol from the watchlist. Forwards to the data service (the owner). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle(async () => {
    const { symbol } = await ctx.params;
    const resp = await fetch(`${dataUrl()}/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
    if (!resp.ok || !json.ok) throw new Error(json.error ?? `data service returned ${resp.status}`);
    return json.data;
  });
}
