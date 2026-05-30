/**
 * Pull insider (Form 4) trades from FMP into EventPayloads.
 * Endpoint `insider-trading/search?symbol=X`. We keep ONLY open-market buys/
 * sells (transactionType P-* / S-*) and drop the noise (gifts, awards, option
 * exercises, tax withholding). Reduced to the latest insider trade per symbol.
 */
import { fmpGet, type EventPayload } from "@qt/shared";
import { latestPerSymbol } from "./_latest.js";
import { fetchPerSymbol } from "./_fetch.js";

export interface FmpInsider {
  symbol?: string;
  transactionType?: string; // "P-Purchase" | "S-Sale" | "G-Gift" | "A-Award" | "M-Exempt" | ...
  acquisitionOrDisposition?: string; // A | D
  securitiesTransacted?: number;
  price?: number;
  reportingName?: string;
  reportingCik?: string;
  transactionDate?: string;
  filingDate?: string;
  url?: string;
}

/** Open-market buy (P) is bullish, open-market sale (S) is bearish. */
function directionHint(t: FmpInsider): EventPayload["direction_hint"] {
  const code = (t.transactionType ?? "").toUpperCase();
  if (code.startsWith("P-")) return "bullish";
  if (code.startsWith("S-")) return "bearish";
  return null;
}

/** Pure: insider rows (grouped by queried symbol) -> events. Keeps only P/S in window; latest per symbol. */
export function mapInsider(
  grouped: Array<{ symbol: string; rows: FmpInsider[] }>,
  opts: { from: string; to: string },
): EventPayload[] {
  const out: EventPayload[] = [];
  for (const { symbol, rows } of grouped) {
    const sym = symbol.toUpperCase();
    for (const t of rows) {
      const code = (t.transactionType ?? "").toUpperCase();
      // Only open-market buys/sells carry signal; drop gifts/awards/exercises/tax.
      if (!code.startsWith("P-") && !code.startsWith("S-")) continue;
      const when = t.filingDate ?? t.transactionDate; // disclosure moment = knowable time
      if (!when) continue;
      const day = when.slice(0, 10);
      if (day < opts.from || day > opts.to) continue;
      out.push({
        source: "fmp",
        external_id: `insider:${sym}:${t.transactionDate ?? day}:${t.reportingCik ?? t.reportingName ?? "?"}:${t.transactionType}:${t.securitiesTransacted ?? "?"}`,
        symbol: sym,
        event_type: "insider",
        direction_hint: directionHint(t),
        headline: `${t.reportingName ?? "Insider"} ${t.transactionType} ${sym}: ${t.securitiesTransacted ?? "?"} @ ${t.price ?? "?"}`,
        observed_at: when,
        raw: t as unknown as Record<string, unknown>,
      });
    }
  }
  return latestPerSymbol(out);
}

export async function pullInsider(opts: {
  from: string;
  to: string;
  symbols: string[];
  limit?: number;
}): Promise<EventPayload[]> {
  const grouped = await fetchPerSymbol(
    opts.symbols,
    (symbol) =>
      fmpGet<FmpInsider[]>(
        "insider-trading/search",
        { symbol, page: 0, limit: opts.limit ?? 50 },
        { softFail402: true },
      ),
    { label: "pull.insider" },
  );
  return mapInsider(grouped, opts);
}
