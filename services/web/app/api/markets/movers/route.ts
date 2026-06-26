import { dataGet } from "@/lib/data-proxy";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Top gainers / losers / most-active — live, forwarded to the data service. */
export const GET = publicRoute(() => dataGet("/markets/movers"));
