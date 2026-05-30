/**
 * Pull analyst price-target changes from FMP into EventPayloads.
 * Endpoint `price-target-news?symbol=X` — recent-first, symbol-scoped.
 * direction is inferred from the target vs the price when posted (target above
 * current price = bullish). Reduced to the latest target per symbol.
 */
import { fmpGet, type EventPayload } from "@qt/shared";
import { log } from "../log.js";
import { latestPerSymbol } from "./_latest.js";

export interface FmpPriceTarget {
  symbol?: string;
  publishedDate?: string; // ISO-8601 with Z (already UTC)
  priceTarget?: number;
  priceWhenPosted?: number;
  analystCompany?: string;
  analystName?: string;
  newsTitle?: string;
  newsURL?: string;
}

function directionHint(p: FmpPriceTarget): EventPayload["direction_hint"] {
  if (p.priceTarget == null || p.priceWhenPosted == null) return null;
  if (p.priceTarget > p.priceWhenPosted) return "bullish";
  if (p.priceTarget < p.priceWhenPosted) return "bearish";
  return null;
}

/** Pure: price-target rows (grouped by queried symbol) -> events. Window-filtered; latest per symbol. */
export function mapPriceTargets(
  grouped: Array<{ symbol: string; rows: FmpPriceTarget[] }>,
  opts: { from: string; to: string },
): EventPayload[] {
  const out: EventPayload[] = [];
  for (const { symbol, rows } of grouped) {
    const sym = symbol.toUpperCase();
    for (const p of rows) {
      if (p.priceTarget == null || !p.publishedDate) continue; // need a target + a timestamp
      const day = p.publishedDate.slice(0, 10);
      if (day < opts.from || day > opts.to) continue; // recent window only
      out.push({
        source: "fmp",
        external_id: `pt:${sym}:${p.publishedDate}:${p.analystCompany ?? "?"}`,
        symbol: sym,
        event_type: "price_target_change",
        direction_hint: directionHint(p),
        headline: `${p.analystCompany ?? "Analyst"} PT ${sym} -> ${p.priceTarget} (was px ${p.priceWhenPosted ?? "?"})`,
        observed_at: p.publishedDate, // ISO-Z, already UTC
        raw: p as unknown as Record<string, unknown>,
      });
    }
  }
  return latestPerSymbol(out);
}

export async function pullPriceTargets(opts: {
  from: string;
  to: string;
  symbols: string[];
  limit?: number;
}): Promise<EventPayload[]> {
  const grouped = await Promise.all(
    opts.symbols.map(async (symbol) => {
      try {
        const rows = await fmpGet<FmpPriceTarget[]>(
          "price-target-news",
          { symbol, limit: opts.limit ?? 20 },
          { softFail402: true },
        );
        return { symbol, rows: rows ?? [] };
      } catch (err) {
        log.warn("pull.price_targets.symbol_failed", {
          symbol,
          error: err instanceof Error ? err.message : String(err),
        });
        return { symbol, rows: [] as FmpPriceTarget[] };
      }
    }),
  );
  return mapPriceTargets(grouped, opts);
}
