import { handle } from "@/lib/api";
import { getHoldingsStatus } from "@/lib/queries";
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

/** Connection status for the signed-in user (never returns the token). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => getHoldingsStatus(uid));
}

/** Save/update this user's IBKR Flex credentials — data owns the write (and
 *  encrypts the token), so this forwards with the user's id as the account id. */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { token?: string; queryId?: string };
    const token = (body.token ?? "").trim();
    const queryId = (body.queryId ?? "").trim();
    if (!token || !queryId) throw new Error("token and queryId are required");
    const resp = await fetch(`${dataUrl()}/holdings/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: uid, token, queryId }),
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
