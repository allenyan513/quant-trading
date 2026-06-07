/**
 * Watchlist valuation sweep. Reference valuations are normally computed only when
 * a notification flows through the pipeline (event-driven), so watchlist symbols
 * without recent news never get a fair value. This sweep refreshes the reference
 * valuation for EVERY watchlist symbol so the dashboard's buy-zone view always
 * has a current fair_value vs price. Cron-triggered (daily).
 *
 * Cheap to re-run: computeReferenceValuation reuses a fresh snapshot within
 * config.referenceTtlDays() (default 1d), so a second same-day run mostly hits
 * the reuse path. Bounded concurrency keeps FMP/CPU in check; per-symbol
 * failures are isolated.
 */
import { db, dbSchema, mapLimit } from "@qt/shared";
import { computeReferenceValuation } from "./reference.js";
import { log } from "../log.js";

const { watchlist } = dbSchema;
const SWEEP_CONCURRENCY = 3;

export async function sweepWatchlistValuations(): Promise<{ swept: number; ok: number; failed: number }> {
  const rows = await db().select({ symbol: watchlist.symbol }).from(watchlist);
  const symbols = rows.map((r) => r.symbol.toUpperCase());

  const results = await mapLimit(symbols, SWEEP_CONCURRENCY, async (sym) => {
    try {
      // No forceRefresh: reuse a fresh snapshot if one exists (TTL), else recompute + persist.
      await computeReferenceValuation(sym);
      return true;
    } catch (err) {
      log.warn("valuation.sweep.item_failed", { symbol: sym, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  });

  const okCount = results.filter(Boolean).length;
  const res = { swept: symbols.length, ok: okCount, failed: symbols.length - okCount };
  log.info("valuation.sweep.done", res);
  return res;
}
