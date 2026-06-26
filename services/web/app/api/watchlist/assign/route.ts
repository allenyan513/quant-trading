import { dataPost } from "@/lib/data-proxy";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Assign a symbol to a group (listId null/empty → ungroup, back to "All"). Forwards to data. */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody<{ symbol?: string; listId?: string | null }>(req);
  const symbol = (body.symbol ?? "").trim();
  if (!symbol) throw new Error("symbol required");
  return dataPost("/watchlist/assign", { userId: uid, symbol, listId: body.listId ?? null });
});
