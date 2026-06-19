import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

/** Promote a candidate into the watchlist. The data service owns the write, so
 *  this just forwards (web stays read-only on the DB). Auth'd by the dashboard cookie. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    await dataPost("/candidates/promote", { symbol });
    return { symbol, promoted: true };
  });
}
