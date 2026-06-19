import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

// Forward selected staged-news ids to the data service, which materializes them
// into `news` events and delivers one notification per symbol to alpha. Web stays
// read-only on the DB; the write happens in data. Auth'd by the cookie.
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; symbolOverride?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) throw new Error("ids required");
    return dataPost("/news/notify", { ids, symbolOverride: body.symbolOverride ?? {} });
  });
}
