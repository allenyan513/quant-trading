import { dataPost } from "@/lib/data-proxy";
import { listUserWatchlistLists } from "@/lib/queries";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's watchlist groups (read straight from the DB, scoped to the user). */
export const GET = authedRoute((uid) => listUserWatchlistLists(uid));

/** Create a group. Forwards to the data service (the owner). */
export const POST = authedRoute(async (uid, req) => {
  const body = await readBody<{ name?: string }>(req);
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name required");
  return dataPost("/watchlist/lists/create", { userId: uid, name });
});
