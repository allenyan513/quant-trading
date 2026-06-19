import { handle } from "@/lib/api";

export const runtime = "nodejs";

// Static process.env access (Next inlines it); see candidates/dismiss/route.ts.
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Trigger the XBRL Frames fundamental screener on demand. Forwards to the data
 *  service (owner of /scan/*); web stays read-only. Returns the scan summary so
 *  the UI can report how many candidates were queued. Uses fetch (not deliverJson,
 *  which drops the body) to surface the result. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const resp = await fetch(`${dataUrl()}/scan/fundamentals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: unknown; error?: { message?: string } | string } | null;
    if (!resp.ok || !json?.ok) {
      const e = json?.error;
      throw new Error((typeof e === "object" ? e?.message : e) ?? `data /scan/fundamentals returned ${resp.status}`);
    }
    return json.data;
  });
}
