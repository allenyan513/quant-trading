import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { listWatchlistOverview } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data owns the watchlist table (T12): reads come from the DB directly (scoped to
// the session user, with the valuation/position join), writes forward to data.

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
    return dataPost("/watchlist", { userId: uid, symbol, note: body.note });
  });
}
