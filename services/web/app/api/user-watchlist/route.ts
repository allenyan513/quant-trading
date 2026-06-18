import { handle } from "@/lib/api";
import { listUserWatchlist } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** The signed-in user's private watchlist. */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => listUserWatchlist(uid));
}

/** Add a symbol to the user's watchlist — data owns the table, so forward. */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; note?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol is required");
    const resp = await fetch(`${dataUrl()}/user-watchlist/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: uid, symbol, note: body.note }),
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
