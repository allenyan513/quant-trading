/**
 * Pull M&A activity from FMP into EventPayloads.
 * Endpoint `mergers-acquisitions-latest` is MARKET-WIDE (not symbol-scoped), so
 * we pull a recent page and keep only deals touching the watchlist — as either
 * acquirer or target. Being acquired is bullish (takeover premium); acquiring is
 * left neutral. Reduced to the latest deal per (watchlist) symbol.
 *
 * NOTE: M&A is rare, so a single page often yields zero watchlist hits — that's
 * expected. If coverage matters, paginate further (future).
 */
import { fmpGet, type EventPayload } from "@qt/shared";
import { latestPerSymbol } from "./_latest.js";

interface FmpMna {
  symbol?: string; // acquirer
  companyName?: string;
  targetedSymbol?: string;
  targetedCompanyName?: string;
  transactionDate?: string;
  acceptedDate?: string;
  link?: string;
}

export async function pullMna(opts: {
  from: string;
  to: string;
  symbols: string[]; // the watchlist
  limit?: number;
}): Promise<EventPayload[]> {
  const watch = new Set(opts.symbols.map((s) => s.toUpperCase()));
  const rows =
    (await fmpGet<FmpMna[]>(
      "mergers-acquisitions-latest",
      { page: 0, limit: opts.limit ?? 100 },
      { softFail402: true },
    )) ?? [];

  const out: EventPayload[] = [];
  for (const m of rows) {
    const when = m.acceptedDate ?? m.transactionDate;
    if (!when) continue;
    const day = when.slice(0, 10);
    if (day < opts.from || day > opts.to) continue;

    const acquirer = m.symbol?.toUpperCase();
    const target = m.targetedSymbol?.toUpperCase();
    const txDate = (m.transactionDate ?? day).slice(0, 10);

    // Emit one event per watchlist side involved (target = bullish, acquirer = neutral).
    const sides: Array<{ sym: string; dir: EventPayload["direction_hint"] }> = [];
    if (target && watch.has(target)) sides.push({ sym: target, dir: "bullish" });
    if (acquirer && watch.has(acquirer)) sides.push({ sym: acquirer, dir: null });

    for (const { sym, dir } of sides) {
      out.push({
        source: "fmp",
        external_id: `mna:${sym}:${acquirer ?? "?"}:${target ?? "?"}:${txDate}`,
        symbol: sym,
        event_type: "m&a",
        direction_hint: dir,
        headline: `M&A: ${m.companyName ?? acquirer ?? "?"} -> ${m.targetedCompanyName ?? target ?? "?"} (${txDate})`,
        observed_at: when,
        raw: m as unknown as Record<string, unknown>,
      });
    }
  }
  return latestPerSymbol(out);
}
