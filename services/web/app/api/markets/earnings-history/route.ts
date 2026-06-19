import { handle } from "@/lib/api";
import { dataGet } from "@/lib/data-proxy";
import type { EarningsHistRow } from "@qt/shared/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-symbol beat/miss history for the earnings detail drawer. Live FMP via data. */
export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get("symbol") || "").trim();
  return handle(() => dataGet<EarningsHistRow[]>(`/markets/earnings-history?symbol=${encodeURIComponent(symbol)}`));
}
