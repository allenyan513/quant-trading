/**
 * Earnings-surprise discovery scanner (deterministic, no LLM). Reuses the
 * market-wide `earnings-calendar` feed — but where /pull/earnings FILTERS to the
 * watchlist, this keeps symbols NOT on the watchlist whose EPS surprise clears a
 * threshold, as discovery candidates. Promotion to the watchlist is a separate
 * gated step (candidates.ts); candidates never reach alpha.
 */
import { fmpGet } from "@qt/shared";
import type { FmpEarning } from "../pull/earnings.js";
import { getWatchlistSymbols } from "../watchlist.js";
import { upsertCandidates, type CandidateInput } from "../candidates.js";
import { log } from "../log.js";

/** EPS surprise as a fraction of |estimate|; null if not computable. */
function surprisePct(e: FmpEarning): number | null {
  if (e.epsActual == null || e.epsEstimated == null || e.epsEstimated === 0) return null;
  return e.epsActual / e.epsEstimated - 1;
}

/**
 * Pure: market-wide earnings rows → discovery candidates. Keeps reported,
 * non-watchlist symbols whose |EPS surprise| ≥ threshold; one candidate per
 * symbol (the biggest surprise wins).
 */
export function selectEarningsCandidates(
  rows: FmpEarning[],
  watchlist: string[],
  minSurprisePct: number,
): CandidateInput[] {
  const watch = new Set(watchlist.map((s) => s.toUpperCase()));
  const best = new Map<string, { cand: CandidateInput; mag: number }>();
  for (const e of rows) {
    if (e.epsActual == null) continue; // not yet reported
    const sym = e.symbol?.toUpperCase();
    if (!sym || watch.has(sym)) continue; // already in the universe
    const surp = surprisePct(e);
    if (surp == null) continue;
    const mag = Math.abs(surp);
    if (mag < minSurprisePct) continue;
    const prev = best.get(sym);
    if (prev && prev.mag >= mag) continue;
    const pct = (surp * 100).toFixed(1);
    best.set(sym, {
      mag,
      cand: {
        symbol: sym,
        source: "earnings_surprise",
        discoveryReason: `EPS ${e.epsActual} vs est ${e.epsEstimated} (${surp >= 0 ? "+" : ""}${pct}%) on ${e.date}`,
        score: mag,
        detail: e as unknown as Record<string, unknown>,
      },
    });
  }
  return [...best.values()].map((v) => v.cand);
}

/** Scan a date window for out-of-universe earnings surprises and queue candidates. */
export async function scanEarnings(opts: {
  from: string;
  to: string;
  minSurprisePct: number;
}): Promise<{ scanned: number; candidates: number }> {
  const rows = (await fmpGet<FmpEarning[]>("earnings-calendar", { from: opts.from, to: opts.to })) ?? [];
  const watchlist = await getWatchlistSymbols();
  const cands = selectEarningsCandidates(rows, watchlist, opts.minSurprisePct);
  await upsertCandidates(cands);
  log.info("scan.earnings.done", {
    scanned: rows.length,
    candidates: cands.length,
    window: `${opts.from}..${opts.to}`,
  });
  return { scanned: rows.length, candidates: cands.length };
}
