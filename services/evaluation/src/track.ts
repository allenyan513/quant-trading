/**
 * Deterministic outcome tracking. For each open signal whose horizons have
 * elapsed, record forward return + alpha vs benchmark and resolve the signal
 * lifecycle. Ported in spirit from quant-researcher's DecisionTracking.
 *
 * v1 simplification: uses the latest close as the horizon price (proxy) and a
 * crude SPY benchmark. M4 will use the exact historical close at the horizon
 * date and a sector-aware benchmark.
 */
import { eq, inArray } from "drizzle-orm";
import { db, dbSchema, fmpGet } from "@qt/shared";

const { tradingSignals, signalOutcomes } = dbSchema;

const HORIZONS: { key: string; days: number }[] = [
  { key: "1d", days: 1 },
  { key: "1w", days: 7 },
  { key: "1m", days: 30 },
];

interface FmpQuote { symbol: string; price?: number | null; changePercentage?: number | null }

async function latestPrice(symbol: string): Promise<number | null> {
  const q = await fmpGet<FmpQuote[]>("quote", { symbol }, { softFail402: true });
  return q?.[0]?.price ?? null;
}

function resolveLifecycle(
  direction: string,
  price: number,
  target: number | null,
  stop: number | null,
): "target_hit" | "stopped_out" | null {
  if (direction === "buy") {
    if (target != null && price >= target) return "target_hit";
    if (stop != null && price <= stop) return "stopped_out";
  } else if (direction === "sell") {
    if (target != null && price <= target) return "target_hit";
    if (stop != null && price >= stop) return "stopped_out";
  }
  return null;
}

export async function trackOutcomes(): Promise<{ scanned: number; updated: number }> {
  const open = await db()
    .select()
    .from(tradingSignals)
    .where(inArray(tradingSignals.status, ["open"]));

  const spy = await latestPrice("SPY");
  let updated = 0;
  const now = Date.now();

  for (const s of open) {
    const price = await latestPrice(s.symbol);
    if (price == null || s.entryPrice == null) continue;

    const elapsedDays = (now - s.createdAt.getTime()) / (24 * 3600 * 1000);
    const returnPct = (price / s.entryPrice - 1) * 100;
    const benchPct = spy != null ? null : null; // benchmark baseline not stored in v1
    const alphaPct = benchPct != null ? returnPct - benchPct : null;

    for (const h of HORIZONS) {
      if (elapsedDays < h.days) continue;
      await db()
        .insert(signalOutcomes)
        .values({
          signalId: s.id,
          horizon: h.key,
          priceAtHorizon: price,
          returnPct,
          benchmarkReturnPct: benchPct,
          alphaPct,
          resolvedStatus: s.status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [signalOutcomes.signalId, signalOutcomes.horizon],
          set: { priceAtHorizon: price, returnPct, alphaPct, updatedAt: new Date() },
        });
    }

    // Lifecycle resolution.
    const hit = resolveLifecycle(s.direction, price, s.targetPrice, s.stopLoss);
    let newStatus: string | null = hit;
    if (!newStatus && s.expiresAt && now > s.expiresAt.getTime()) newStatus = "expired";
    if (newStatus && newStatus !== s.status) {
      await db().update(tradingSignals).set({ status: newStatus }).where(eq(tradingSignals.id, s.id));
      updated++;
    }
  }

  return { scanned: open.length, updated };
}
