import { dataPost } from "@/lib/data-proxy";
import { listWatchlistOverview } from "@/lib/queries";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data owns the watchlist table (T12): reads come from the DB directly (scoped to
// the session user, with the valuation/position join), writes forward to data.

/** The signed-in user's watchlist (joined with valuation / position). */
export const GET = authedRoute((uid) => listWatchlistOverview(uid));

/** Add a symbol to the user's watchlist. Forwards to the data service (the owner). */
export const POST = authedRoute(async (uid, req) => {
  const { symbol, note } = await readBody<{ symbol?: string; note?: string }>(req);
  const s = (symbol ?? "").trim();
  if (!s) throw new Error("symbol required");
  return dataPost("/watchlist", { userId: uid, symbol: s, note });
});
