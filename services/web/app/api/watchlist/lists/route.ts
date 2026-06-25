import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { listUserWatchlistLists } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's watchlist groups (read straight from the DB, scoped to the user). */
export async function GET() {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() => listUserWatchlistLists(uid));
}

/** Create a group. Forwards to the data service (the owner). */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) throw new Error("name required");
    return dataPost("/watchlist/lists/create", { userId: uid, name });
  });
}
