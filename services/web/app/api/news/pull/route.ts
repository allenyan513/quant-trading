import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

// The data service owns the FMP pull + `news_items` write; web just forwards the
// request and relays the downstream counts. Auth'd by the dashboard cookie.
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return dataPost("/news/pull", body);
  });
}
