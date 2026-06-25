/**
 * Deterministic per-symbol cache warming (issue #59 news-driven flow).
 *
 * After a news row passes the screen, we proactively fill the symbol's backing
 * marketdata caches via the read-through getters BEFORE the triage LLM runs — so
 * the agent's judgement (and alpha's downstream repricing) read warm, complete
 * data instead of relying on the agent to remember to pull each piece.
 *
 * Each getter is read-through (fresh cache → no-op; stale/missing → FMP + persist),
 * so re-warming a symbol within the TTL is cheap. Every call is isolated: one
 * gated/failed dataset (e.g. premium-gated statements on the current FMP plan)
 * must not abort the rest. Warming is best-effort — correctness never depends on
 * it (alpha's own read-through is the backstop), it only moves the FMP latency
 * off the hot path.
 */
import { marketdata, mapLimit } from "@qt/shared";
import { log } from "./log.js";

/** Max getters in flight per symbol — bounds the fan-out so a symbol doesn't
 *  burst all datasets at once (fmpGet still throttles globally underneath). */
const WARM_CONCURRENCY = 3;

/** The datasets we pre-fill for a screened-in symbol: 3 statements + ratios +
 *  estimates + daily prices + the sporadic event records. */
const WARMERS: Array<[string, (s: string) => Promise<unknown>]> = [
  ["income", (s) => marketdata.getIncomeStatement(s, "annual")],
  ["balance", (s) => marketdata.getBalanceSheet(s, "annual")],
  ["cashflow", (s) => marketdata.getCashFlow(s, "annual")],
  // Quarterly three-statements (SEC EDGAR). companyfacts returns all three in
  // one fetch, so the first quarter getter fills the other two and they
  // short-circuit on freshness. Ratios/estimates stay annual (FMP-only).
  ["income_q", (s) => marketdata.getIncomeStatement(s, "quarter")],
  ["balance_q", (s) => marketdata.getBalanceSheet(s, "quarter")],
  ["cashflow_q", (s) => marketdata.getCashFlow(s, "quarter")],
  ["ratios", (s) => marketdata.getRatios(s, "annual")],
  ["estimates", (s) => marketdata.getEstimates(s, "annual")],
  ["prices", (s) => marketdata.getDailyPrices(s, 60)],
  ["ratings", (s) => marketdata.getRatings(s)],
  ["price_targets", (s) => marketdata.getPriceTargets(s)],
  ["profile", (s) => marketdata.getProfile(s)],
];

/** Warm all backing caches for one symbol. Per-dataset failures are logged, not thrown. */
export async function warmSymbol(symbol: string): Promise<void> {
  const sym = symbol.toUpperCase();
  await mapLimit(WARMERS, WARM_CONCURRENCY, async ([name, fn]) => {
    try {
      await fn(sym);
    } catch (err) {
      log.warn("news.triage.warm_failed", { symbol: sym, dataset: name, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
