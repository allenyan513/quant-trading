import { dataPost } from "@/lib/data-proxy";
import { publicRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Promote a candidate into the watchlist. The data service owns the write, so
 *  this just forwards (web stays read-only on the DB). Auth'd by the dashboard cookie. */
export const POST = publicRoute(async (req) => {
  const body = await readBody<{ symbol?: string }>(req);
  const symbol = (body.symbol ?? "").trim();
  if (!symbol) throw new Error("symbol required");
  await dataPost("/candidates/promote", { symbol });
  return { symbol, promoted: true };
});
