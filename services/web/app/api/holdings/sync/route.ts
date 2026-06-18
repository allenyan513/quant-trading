import { handle } from "@/lib/api";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DATA_URL via static process.env (Next inlines it; config.dataUrl()'s dynamic
// lookup reads empty in the route runtime — see api/candidates/promote).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Trigger a sync of THIS user's holdings — data owns the work, so this forwards
 *  with the user's id as the account id. Used by the Settings "refresh" button +
 *  the auto-sync right after connecting. */
export async function POST() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const resp = await fetch(`${dataUrl()}/holdings/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: uid }),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: unknown;
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
