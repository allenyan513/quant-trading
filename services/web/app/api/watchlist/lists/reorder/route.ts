import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";

/** Persist a new tab order (drag-reorder). Forwards the id sequence to the data service. */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
    if (ids.length === 0) throw new Error("ids required");
    return dataPost("/watchlist/lists/reorder", { userId: uid, ids });
  });
}
