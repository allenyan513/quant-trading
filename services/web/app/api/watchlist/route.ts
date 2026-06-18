import { handle } from "@/lib/api";
import { listWatchlistOverview } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data owns the watchlist table (T12): reads come from the DB directly (scoped to
// the session user, with the valuation/position join), writes forward to the data
// service. Static process.env.DATA_URL (Next inlines it; config.dataUrl reads empty).
function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** The signed-in user's watchlist (joined with valuation / position). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => listWatchlistOverview(uid));
}

/** Add a symbol to the user's watchlist. Forwards to the data service (the owner). */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; note?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    const resp = await fetch(`${dataUrl()}/watchlist`, {
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
