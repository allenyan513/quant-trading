import { handle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DATA_URL via static process.env (Next inlines it; config.dataUrl()'s dynamic
// lookup reads empty in the route runtime — see api/candidates/promote).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Trigger a holdings sync — data owns the work, so this forwards to it. Used by
 *  the Settings tab's "refresh" button + the auto-sync right after connecting. */
export async function POST() {
  return handle(async () => {
    const resp = await fetch(`${dataUrl()}/holdings/sync`, { method: "POST" });
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: unknown;
      // data returns an envelope whose `error` is an object { code, message }.
      error?: { code?: string; message?: string } | string;
    };
    if (!resp.ok || !json.ok) throw new Error(dataError(json.error, resp.status));
    return json.data;
  });
}

/** Surface the data service's envelope error (object {code,message}) as a string. */
function dataError(err: { code?: string; message?: string } | string | undefined, status: number): string {
  if (typeof err === "string") return err;
  return err?.message ?? err?.code ?? `data service returned ${status}`;
}
