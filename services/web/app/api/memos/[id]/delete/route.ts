import { authedRoute } from "@/lib/route";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete a memo (cascade removes its symbol links). Forwards to data; scoped to the user. */
export const POST = authedRoute(async (uid, _req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return dataPost("/memos/delete", { userId: uid, id });
});
