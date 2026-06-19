import { handle } from "@/lib/api";
import { dataGet } from "@/lib/data-proxy";
import type { EarningsRow } from "@qt/shared/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upcoming earnings calendar (analyst-covered), forwarded to data. Optional
 *  ?from&to override the default 2-week window. */
export async function GET(req: Request) {
  const qs = new URL(req.url).search; // pass through ?from&to if present
  return handle(() => dataGet<EarningsRow[]>(`/markets/earnings-calendar${qs}`));
}
