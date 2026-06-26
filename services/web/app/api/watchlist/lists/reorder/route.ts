import { dataPost } from "@/lib/data-proxy";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Persist a new tab order (drag-reorder). Forwards the id sequence to the data service. */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody<{ ids?: unknown }>(req);
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
  if (ids.length === 0) throw new Error("ids required");
  return dataPost("/watchlist/lists/reorder", { userId: uid, ids });
});
