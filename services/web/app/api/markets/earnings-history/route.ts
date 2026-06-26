import { dataGet } from "@/lib/data-proxy";
import { publicRoute } from "@/lib/route";
import type { EarningsHistRow } from "@qt/shared/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-symbol beat/miss history for the earnings detail drawer. Live FMP via data. */
export const GET = publicRoute((req) => {
  const symbol = (new URL(req.url).searchParams.get("symbol") || "").trim();
  return dataGet<EarningsHistRow[]>(`/markets/earnings-history?symbol=${encodeURIComponent(symbol)}`);
});
