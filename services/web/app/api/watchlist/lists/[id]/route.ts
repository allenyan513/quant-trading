import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";

/** Rename a group. Forwards to the data service (owner). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) throw new Error("name required");
    return dataPost("/watchlist/lists/rename", { userId: uid, id, name });
  });
}

/** Delete a group; its members fall back to "All". Forwards to the data service. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const { id } = await ctx.params;
    return dataPost("/watchlist/lists/delete", { userId: uid, id });
  });
}
