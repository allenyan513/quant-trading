import { handle } from "@/lib/api";

export const runtime = "nodejs";

// The detail page's "刷新数据" refreshes everything shown for a symbol. web is
// read-only, so it orchestrates two owners (T12): data warms the marketdata
// caches + pulls news; alpha recomputes the reference valuation. Static
// process.env.* (Next inlines them).
// Static access only: Next inlines `process.env.DATA_URL` at build, but a
// dynamic `process.env[name]` is left undefined at runtime.
function svcUrl(name: "DATA_URL" | "ALPHA_URL"): string {
  const u = name === "DATA_URL" ? process.env.DATA_URL : process.env.ALPHA_URL;
  if (!u) throw new Error(`Missing required env var: ${name}`);
  return u;
}

async function post(url: string, body: unknown) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
  if (!resp.ok || !json.ok) throw new Error(json.error ?? `${url} returned ${resp.status}`);
  return json.data;
}

export async function POST(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle(async () => {
    const { symbol: raw } = await ctx.params;
    const symbol = raw.toUpperCase();

    // 1) Warm marketdata + news (required — this is what most tabs read).
    const warmed = await post(`${svcUrl("DATA_URL")}/warm`, { symbol });

    // 2) Recompute the reference valuation from the freshly-warmed data. Best
    // effort: a symbol with too little history yields a price-only snapshot, and
    // alpha being unreachable shouldn't fail the whole refresh — the marketdata
    // tabs already updated. Surface the outcome so the UI can hint.
    let valuation: { ok: boolean; error?: string } = { ok: true };
    try {
      await post(`${svcUrl("ALPHA_URL")}/internal/valuation`, { symbol });
    } catch (err) {
      valuation = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return { ...(warmed as object), valuation };
  });
}
