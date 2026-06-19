import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

/** Dismiss a candidate. Forwards to the data service (the owner); web stays read-only. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string };
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new Error("symbol required");
    await dataPost("/candidates/dismiss", { symbol });
    return { symbol, dismissed: true };
  });
}
