import { handle } from "@/lib/api";
import { dataGet } from "@/lib/data-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveQuote {
  symbol: string;
  price: number;
  changePct: number | null;
  prevClose: number | null;
  fetchedAt: string;
}

/**
 * Near-real-time quotes for the live price ticking (watchlist + symbol detail).
 * web is read-only and can't reach FMP, so it forwards to the data service, which
 * read-through caches each quote (TTL-gated) into data_quotes. Clients poll this
 * only during market hours. ?symbols= is comma-separated.
 */
export async function GET(req: Request) {
  const symbols = (new URL(req.url).searchParams.get("symbols") || "").trim();
  if (!symbols) return handle(async () => ({ quotes: [] as LiveQuote[] }));
  return handle(() => dataGet<{ quotes: LiveQuote[] }>(`/quotes?symbols=${encodeURIComponent(symbols)}`));
}
