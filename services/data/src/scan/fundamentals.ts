/**
 * XBRL Frames fundamental-screening scanner (deterministic, no LLM; issue #106).
 * Market-wide: pulls a concept frame for two periods, ranks YoY growth across all
 * filers, resolves cik→ticker, and queues the top-N as discovery candidates.
 * Like the earnings scanner, candidates are a read-only discovery queue — they
 * NEVER reach alpha. v1 screen: revenue YoY growth.
 */
import {
  fetchMergedFrame,
  scoreYoyGrowth,
  rankByGrowth,
  type GrowthScore,
} from "@qt/shared/xbrl-frames";
import { fetchCompanyTickers } from "@qt/shared/edgar-8k";
import { upsertCandidates, type CandidateInput } from "../candidates.js";
import { log } from "../log.js";

/** Compact USD for the human-readable reason ($1.23B / $456M). */
function usd(n: number): string {
  return Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

/**
 * Pure: growth scores → discovery candidates. Resolve cik→ticker and drop
 * unmapped ciks (funds/foreign/ADR) BEFORE ranking, so a no-ticker filer never
 * consumes a top-N slot. One candidate per ticker.
 */
export function selectFundamentalCandidates(
  scores: GrowthScore[],
  cikToTicker: Map<number, string>,
  opts: { period: string; topN: number; minGrowthPct: number },
): CandidateInput[] {
  const withTicker = scores
    .map((s) => ({ s, ticker: cikToTicker.get(s.cik) }))
    .filter((w): w is { s: GrowthScore; ticker: string } => w.ticker !== undefined);
  // Dedup by ticker BEFORE ranking — two CIKs can resolve to one symbol (a CIK change,
  // or a ticker reused in company_tickers.json); keep the highest-growth one so a symbol
  // yields exactly one candidate (no silent PK clobber in upsertCandidates, no wasted top-N slot).
  const bestByTicker = new Map<string, { s: GrowthScore; ticker: string }>();
  for (const w of withTicker) {
    const prev = bestByTicker.get(w.ticker);
    if (!prev || w.s.growth > prev.s.growth) bestByTicker.set(w.ticker, w);
  }
  const deduped = [...bestByTicker.values()];
  const tickerByCik = new Map(deduped.map((w) => [w.s.cik, w.ticker] as const));
  const ranked = rankByGrowth(
    deduped.map((w) => w.s),
    { topN: opts.topN, minGrowthPct: opts.minGrowthPct },
  );
  const cands: CandidateInput[] = [];
  for (const s of ranked) {
    const ticker = tickerByCik.get(s.cik);
    if (!ticker) continue; // unreachable (built from withTicker) — satisfies the type
    const pct = (s.growth * 100).toFixed(1);
    cands.push({
      symbol: ticker,
      source: "fundamental_screen",
      discoveryReason: `营收同比 ${s.growth >= 0 ? "+" : ""}${pct}% (${opts.period}: ${usd(s.valNow)} vs ${usd(s.valAgo)})`,
      score: s.growth,
      detail: {
        screen: "revenue_growth",
        period: opts.period,
        valNow: s.valNow,
        valAgo: s.valAgo,
        growth: s.growth,
        entityName: s.entityName,
      },
    });
  }
  return cands;
}

/** Run the revenue-YoY-growth screen for a period and queue candidates. */
export async function scanFundamentals(opts: {
  period: string;
  agoPeriod: string;
  concepts: string[];
  minBase: number;
  topN: number;
  minGrowthPct: number;
}): Promise<{ period: string; scannedNow: number; scannedAgo: number; scored: number; candidates: number }> {
  const now = await fetchMergedFrame(opts.concepts, { period: opts.period });
  const ago = await fetchMergedFrame(opts.concepts, { period: opts.agoPeriod });
  const scores = scoreYoyGrowth(now.merged, ago.merged, { minBase: opts.minBase });

  // Frames carry no ticker — invert the ticker→{cik} map (cik comes padded; bridge to numeric).
  const tickers = await fetchCompanyTickers();
  const cikToTicker = new Map<number, string>();
  for (const [tkr, { cik }] of tickers) cikToTicker.set(Number(cik), tkr);

  const cands = selectFundamentalCandidates(scores, cikToTicker, {
    period: opts.period,
    topN: opts.topN,
    minGrowthPct: opts.minGrowthPct,
  });
  await upsertCandidates(cands);
  log.info("scan.fundamentals.done", {
    period: opts.period,
    agoPeriod: opts.agoPeriod,
    scannedNow: now.merged.size,
    scannedAgo: ago.merged.size,
    scored: scores.length,
    candidates: cands.length,
    coverageNow: now.coverage,
  });
  return { period: opts.period, scannedNow: now.merged.size, scannedAgo: ago.merged.size, scored: scores.length, candidates: cands.length };
}
