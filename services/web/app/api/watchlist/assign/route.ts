import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";

/** Assign a symbol to a group (listId null/empty → ungroup, back to "All"). Forwards to data. */
export async function POST(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; listId?: string | null };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    return dataPost("/watchlist/assign", { userId: uid, symbol, listId: body.listId ?? null });
  });
}
