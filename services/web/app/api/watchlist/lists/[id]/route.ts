import { dataPost } from "@/lib/data-proxy";
import { authedRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Rename a group. Forwards to the data service (owner). */
export const PATCH = authedRoute(async (uid, req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readBody<{ name?: string }>(req);
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name required");
  return dataPost("/watchlist/lists/rename", { userId: uid, id, name });
});

/** Delete a group; its members fall back to "All". Forwards to the data service. */
export const DELETE = authedRoute(async (uid, _req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return dataPost("/watchlist/lists/delete", { userId: uid, id });
});
