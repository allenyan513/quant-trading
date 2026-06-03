import { handle } from "@/lib/api";

export const runtime = "nodejs";

// Forward selected staged-news ids to the data service, which materializes them
// into `news` events and delivers one notification per symbol to alpha. Web
// stays read-only on the DB; the write happens in data. Auth'd by the cookie.
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; symbolOverride?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) throw new Error("ids required");
    const resp = await fetch(`${dataUrl()}/news/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, symbolOverride: body.symbolOverride ?? {} }),
    });
    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
    if (!resp.ok || !json.ok) throw new Error(json.error ?? `data service returned ${resp.status}`);
    return json.data;
  });
}
