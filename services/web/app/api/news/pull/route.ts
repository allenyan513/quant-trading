import { dataPost } from "@/lib/data-proxy";
import { publicRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

// The data service owns the FMP pull + `news_items` write; web just forwards the
// request and relays the downstream counts. Auth'd by the dashboard cookie.
export const POST = publicRoute(async (req) => {
  const body = await readBody<Record<string, unknown>>(req);
  return dataPost("/news/pull", body);
});
