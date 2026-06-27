import { authedRoute, readBody } from "@/lib/route";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit a memo (title / body / status / direction / pinned, add/remove symbols). Forwards
 *  to the data service (owner). Scoped to the session user. */
export const POST = authedRoute(async (uid, req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readBody<{ title?: string; markdown?: string; status?: string; direction?: string; pinned?: boolean; addSymbols?: string[]; removeSymbols?: string[] }>(req);
  return dataPost("/memos/update", {
    userId: uid,
    id,
    title: body.title,
    markdown: body.markdown,
    status: body.status,
    direction: body.direction,
    pinned: body.pinned,
    addSymbols: body.addSymbols,
    removeSymbols: body.removeSymbols,
  });
});
