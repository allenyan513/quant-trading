import { dataPost } from "@/lib/data-proxy";
import { publicRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Dismiss a candidate. Forwards to the data service (the owner); web stays read-only. */
export const POST = publicRoute(async (req) => {
  const body = await readBody<{ symbol?: string }>(req);
  const symbol = (body.symbol ?? "").trim();
  if (!symbol) throw new Error("symbol required");
  await dataPost("/candidates/dismiss", { symbol });
  return { symbol, dismissed: true };
});
