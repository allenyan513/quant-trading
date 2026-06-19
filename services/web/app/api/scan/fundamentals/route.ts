import { handle } from "@/lib/api";
import { dataPost } from "@/lib/data-proxy";

export const runtime = "nodejs";

/** Trigger the XBRL Frames fundamental screener on demand. Forwards to data (owner
 *  of /scan/*); returns the scan summary so the UI can report how many candidates
 *  were queued. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return dataPost("/scan/fundamentals", body);
  });
}
