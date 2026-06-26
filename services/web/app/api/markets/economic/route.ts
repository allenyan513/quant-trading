import { dataGet } from "@/lib/data-proxy";
import { publicRoute } from "@/lib/route";
import type { EconEventRow } from "@qt/shared/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upcoming economic calendar (High/Medium impact), forwarded to data. Optional
 *  ?from&to override the default 2-week window. */
export const GET = publicRoute((req) => {
  const qs = new URL(req.url).search;
  return dataGet<EconEventRow[]>(`/markets/economic-calendar${qs}`);
});
