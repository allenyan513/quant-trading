import { dataPost } from "@/lib/data-proxy";
import { publicRoute, readBody } from "@/lib/route";

export const runtime = "nodejs";

/** Trigger the XBRL Frames fundamental screener on demand. Forwards to data (owner
 *  of /scan/*); returns the scan summary so the UI can report how many candidates
 *  were queued. */
export const POST = publicRoute(async (req) => {
  const body = await readBody<Record<string, unknown>>(req);
  return dataPost("/scan/fundamentals", body);
});
