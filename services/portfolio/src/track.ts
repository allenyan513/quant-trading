/**
 * Deterministic position settlement. For each open position, fetch the current
 * price and resolve its lifecycle against the originating signal's target/stop/
 * expiry: on a hit, close the position (exit price + realized return) and sync
 * the signal's status. No LLM, no learning — just book settlement.
 *
 * v1 simplification: uses the latest close as the exit price (proxy). Long-only,
 * so realized return is exit/entry - 1; the sell branch is kept for completeness.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema, fmpGet } from "@qt/shared";
import { log } from "./log.js";

const { positions, tradingSignals } = dbSchema;

interface FmpQuote { symbol: string; price?: number | null }

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

/** Settle open positions; close those that hit target/stop/expiry. */
export async function settlePositions(): Promise<{ scanned: number; closed: number }> {
  const open = await db()
    .select({
      signalId: positions.signalId,
      symbol: positions.symbol,
      direction: positions.direction,
      entryPrice: positions.entryPrice,
      targetPrice: tradingSignals.targetPrice,
      stopLoss: tradingSignals.stopLoss,
      expiresAt: tradingSignals.expiresAt,
    })
    .from(positions)
    .innerJoin(tradingSignals, eq(positions.signalId, tradingSignals.id))
    .where(eq(positions.status, "open"));

  const now = Date.now();
  let closed = 0;

  for (const p of open) {
    const price = await latestPrice(p.symbol);
    if (price == null || p.entryPrice == null) continue;

    const hit = resolveLifecycle(p.direction, price, p.targetPrice, p.stopLoss);
    const newStatus: string | null =
      hit ?? (p.expiresAt && now > p.expiresAt.getTime() ? "expired" : null);
    if (!newStatus) continue;

    const realizedReturn = p.direction === "buy" ? price / p.entryPrice - 1 : p.entryPrice / price - 1;
    await db()
      .update(positions)
      .set({ status: "closed", closedAt: new Date(), exitPrice: price, realizedReturn })
      .where(and(eq(positions.signalId, p.signalId), eq(positions.status, "open")));
    await db().update(tradingSignals).set({ status: newStatus }).where(eq(tradingSignals.id, p.signalId));

    log.info("portfolio.closed", {
      signal: p.signalId,
      symbol: p.symbol,
      status: newStatus,
      exit: price,
      realized_return: Number(realizedReturn.toFixed(4)),
    });
    closed++;
  }

  return { scanned: open.length, closed };
}
