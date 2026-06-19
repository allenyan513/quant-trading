import { handle } from "@/lib/api";
import { dataGet } from "@/lib/data-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Top gainers / losers / most-active — live, forwarded to the data service. */
export async function GET() {
  return handle(() => dataGet("/markets/movers"));
}
