import { handle } from "@/lib/api";
import { getHoldingsStatus } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DATA_URL via static process.env (Next inlines it; config.dataUrl()'s dynamic
// lookup reads empty in the route runtime — see api/candidates/promote).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Masked connection status (never returns the raw token). */
export async function GET() {
  return handle(() => getHoldingsStatus());
}

/** Save/update credentials — data owns the write, so this forwards to it. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { token?: string; queryId?: string };
    const token = (body.token ?? "").trim();
    const queryId = (body.queryId ?? "").trim();
    if (!token || !queryId) throw new Error("token and queryId are required");
    const resp = await fetch(`${dataUrl()}/holdings/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, queryId }),
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
