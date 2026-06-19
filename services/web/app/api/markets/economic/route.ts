import { handle } from "@/lib/api";
import { dataGet } from "@/lib/data-proxy";
import type { EconEventRow } from "@qt/shared/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upcoming economic calendar (High/Medium impact), forwarded to data. Optional
 *  ?from&to override the default 2-week window. */
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  return handle(() => dataGet<EconEventRow[]>(`/markets/economic-calendar${qs}`));
}
