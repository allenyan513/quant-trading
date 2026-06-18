import { handle } from "@/lib/api";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";

function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Remove a symbol from the user's watchlist. Forwards to the data service (owner). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const { symbol } = await ctx.params;
    const resp = await fetch(`${dataUrl()}/watchlist/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: uid, symbol }),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string } | string;
    };
    if (!resp.ok || !json.ok) {
      const err = json.error;
      throw new Error(typeof err === "string" ? err : (err?.message ?? err?.code ?? `data service returned ${resp.status}`));
    }
    return json.data;
  });
}
