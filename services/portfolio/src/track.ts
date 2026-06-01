/**
 * Deterministic position settlement. For each open position, fetch the current
 * price and resolve its lifecycle against the originating signal's target/stop/
 * expiry (the pure `settleDecision` in @qt/shared): on a hit, close the position
 * (exit price + realized return) and sync the signal's status. No LLM.
 *
 * Per-symbol price fetch + DB writes run with bounded concurrency (mapLimit),
 * and each position is isolated — one symbol's failure (e.g. a flaky quote)
 * logs a warning and never aborts the rest of the batch.
 */
import { and, eq } from "drizzle-orm";
import { db, dbSchema, fmpGet, mapLimit, settleDecision } from "@qt/shared";
import { log } from "./log.js";

const { positions, tradingSignals } = dbSchema;

const SETTLE_CONCURRENCY = 10;

interface FmpQuote { symbol: string; price?: number | null }

async function latestPrice(symbol: string): Promise<number | null> {
  const q = await fmpGet<FmpQuote[]>("quote", { symbol }, { softFail402: true });
  return q?.[0]?.price ?? null;
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

  const closedFlags = await mapLimit(open, SETTLE_CONCURRENCY, async (p) => {
    try {
      const price = await latestPrice(p.symbol);
      const decision = settleDecision({
        direction: p.direction,
        entryPrice: p.entryPrice,
        price,
        targetPrice: p.targetPrice,
        stopLoss: p.stopLoss,
        expiresAtMs: p.expiresAt ? p.expiresAt.getTime() : null,
        nowMs: now,
      });
      if (!decision.close) return false;

      // Guard on status='open' so a concurrent settle can't double-close.
      await db()
        .update(positions)
        .set({ status: "closed", closedAt: new Date(), exitPrice: price, realizedReturn: decision.realizedReturn })
        .where(and(eq(positions.signalId, p.signalId), eq(positions.status, "open")));
      await db().update(tradingSignals).set({ status: decision.status }).where(eq(tradingSignals.id, p.signalId));

      log.info("portfolio.closed", {
        signal: p.signalId,
        symbol: p.symbol,
        status: decision.status,
        exit: price,
        realized_return: Number(decision.realizedReturn.toFixed(4)),
      });
      return true;
    } catch (err) {
      log.warn("portfolio.settle_failed", {
        signal: p.signalId,
        symbol: p.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  });

  return { scanned: open.length, closed: closedFlags.filter(Boolean).length };
}
