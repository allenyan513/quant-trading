/**
 * Reference valuation (System A) — slow, fundamentals-based intrinsic value.
 *
 * Replaces the v1 placeholder (FMP's single `dcf` field) with the ported
 * value-scope consensus engine: FCFF DCF (primary) + EBITDA-exit + multiples +
 * PEG + EPV + DDM, archetype-aware. Inputs come from the marketdata read-through
 * cache (PIT statements/estimates/prices) + profile + peers. Persists an
 * immutable snapshot whose `detail` is the full ValuationSummary (replayable).
 *
 * Degrades gracefully: if statements are missing (premium-gated / unknown
 * symbol) or the engine throws, we still record a price-only snapshot with a
 * null fair value — the agent reprices from the event regardless.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, dbSchema, codeVersion, config, marketdata, type ReferenceValuation } from "@qt/shared";
import { computeFullValuation } from "./models/summary.js";
import { VERDICT_THRESHOLD } from "./constants.js";
import { toFinancialStatements, toAnalystEstimates, toCompany, toPeerComparisons } from "./adapter.js";
import { log } from "../log.js";

const { valuationSnapshots } = dbSchema;

function median(xs: number[]): number | undefined {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1]! + v[mid]!) / 2;
}

/** Pure: is a snapshot still within the reuse window? */
export function isSnapshotFresh(createdAt: Date, now: Date, ttlDays: number): boolean {
  return now.getTime() - createdAt.getTime() <= ttlDays * 86_400_000;
}

/** Pure: verdict from upside %, using the same threshold as the engine. */
export function verdictFromUpside(upsidePct: number | null): ReferenceValuation["verdict"] {
  if (upsidePct == null) return null;
  if (upsidePct > VERDICT_THRESHOLD) return "undervalued";
  if (upsidePct < -VERDICT_THRESHOLD) return "overvalued";
  return "fairly_valued";
}

/**
 * Reuse a recent reference valuation instead of recomputing. The slow part (fair
 * value + model detail) is reused as-is; only the cheap, price-dependent part
 * (current_price / upside / verdict) is refreshed via a single quote — so the
 * signal still gets TODAY's entry price while we skip the expensive DCF + peers.
 * Returns null when there's no fresh snapshot (caller does a full recompute).
 */
async function tryReuseSnapshot(sym: string, asOf: string): Promise<ReferenceValuation | null> {
  const [snap] = await db()
    .select()
    .from(valuationSnapshots)
    .where(and(eq(valuationSnapshots.symbol, sym), isNotNull(valuationSnapshots.fairValuePerShare)))
    .orderBy(desc(valuationSnapshots.createdAt))
    .limit(1);
  if (!snap || !isSnapshotFresh(snap.createdAt, new Date(), config.referenceTtlDays())) return null;

  const quote = await marketdata.getQuote(sym);
  const price = quote ?? snap.currentPrice ?? null;
  const fair = snap.fairValuePerShare;
  const upside = price && fair ? (fair / price - 1) * 100 : null;
  log.info("reference.reused", { symbol: sym, snapshot: snap.snapshotId, price, fair_value: fair });
  return {
    snapshot_id: snap.snapshotId,
    symbol: sym,
    as_of: asOf,
    fair_value_per_share: fair,
    current_price: price,
    upside_pct: upside,
    verdict: verdictFromUpside(upside),
    detail: { source: "reused", from_snapshot: snap.snapshotId },
  };
}

export async function computeReferenceValuation(
  symbol: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<ReferenceValuation> {
  const sym = symbol.toUpperCase();
  const asOf = new Date().toISOString().slice(0, 10);

  // Reuse a fresh snapshot unless forced (e.g. earnings just changed the financials).
  if (!opts.forceRefresh) {
    const reused = await tryReuseSnapshot(sym, asOf);
    if (reused) return reused;
  }

  const snapshotId = randomUUID();
  const [income, balance, cashflow, estimatesRows, profile, peersRaw, quote] = await Promise.all([
    marketdata.getIncomeStatement(sym, "annual", 12),
    marketdata.getBalanceSheet(sym, "annual", 12),
    marketdata.getCashFlow(sym, "annual", 12),
    marketdata.getEstimates(sym, "annual", 6),
    marketdata.getProfile(sym),
    marketdata.getPeers(sym),
    marketdata.getQuote(sym),
  ]);

  const historicals = toFinancialStatements(
    income.map((r) => r.data),
    balance.map((r) => r.data),
    cashflow.map((r) => r.data),
  );
  const company = toCompany(profile, historicals[0], quote);
  const currentPrice = quote ?? company.price ?? null;

  // Persist a price-only snapshot + bail when we can't value (no statements or no price).
  if (historicals.length === 0 || !currentPrice) {
    log.warn("reference.partial", {
      symbol: sym,
      price: currentPrice,
      historicals: historicals.length,
      hint: "no statements (premium-gated/unknown) or no price — skipping valuation engine",
    });
    await db().insert(valuationSnapshots).values({
      snapshotId, symbol: sym, asOf,
      fairValuePerShare: null, currentPrice: currentPrice ?? null, upsidePct: null, verdict: null,
      detail: { source: "price_only", reason: "insufficient_inputs", peers: peersRaw.length },
      codeVersion: codeVersion(),
    });
    return {
      snapshot_id: snapshotId, symbol: sym, as_of: asOf,
      fair_value_per_share: null, current_price: currentPrice ?? null, upside_pct: null, verdict: null,
      detail: { source: "price_only" },
    };
  }

  const peers = toPeerComparisons(peersRaw);
  const peerEVEBITDAMedian = median(peersRaw.map((p) => p.ev_ebitda ?? NaN));

  let fairValue: number | null = null;
  let upsidePct: number | null = null;
  let verdict: ReferenceValuation["verdict"] = null;
  let detail: Record<string, unknown>;

  try {
    const summary = computeFullValuation({
      company,
      historicals,
      estimates: toAnalystEstimates(estimatesRows.map((r) => r.data)),
      peers,
      currentPrice,
      riskFreeRate: config.riskFreeRate(),
      peerEVEBITDAMedian,
    });
    fairValue = Number.isFinite(summary.consensus_fair_value) && summary.consensus_fair_value > 0
      ? summary.consensus_fair_value
      : null;
    upsidePct = fairValue != null ? summary.consensus_upside : null;
    verdict = fairValue != null ? summary.verdict : null;
    detail = summary as unknown as Record<string, unknown>;
  } catch (err) {
    log.warn("reference.engine_failed", {
      symbol: sym,
      error: err instanceof Error ? err.message : String(err),
    });
    detail = { source: "engine_error", error: err instanceof Error ? err.message : String(err) };
  }

  await db().insert(valuationSnapshots).values({
    snapshotId, symbol: sym, asOf,
    fairValuePerShare: fairValue, currentPrice, upsidePct, verdict,
    detail, codeVersion: codeVersion(),
  });

  return {
    snapshot_id: snapshotId, symbol: sym, as_of: asOf,
    fair_value_per_share: fairValue, current_price: currentPrice, upside_pct: upsidePct, verdict,
    detail: { source: "consensus", archetype: (detail as { classification?: { archetype?: string } }).classification?.archetype },
  };
}
