import { handle } from "@/lib/api";

export const runtime = "nodejs";

// The data service owns the FMP pull + `news_items` write; web just forwards
// the request and relays the downstream counts. See app/api/data/route.ts for
// why DATA_URL is read via static process.env (Next inlines it; config.dataUrl
// would not). Auth'd by the dashboard cookie.
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const resp = await fetch(`${dataUrl()}/news/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
    if (!resp.ok || !json.ok) throw new Error(json.error ?? `data service returned ${resp.status}`);
    return json.data;
  });
}
