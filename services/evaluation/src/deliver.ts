/**
 * Outbox-backed forwarding of a registered signal to the portfolio service, which
 * owns position sizing and the `positions` table. Mirrors analysis's signal
 * outbox: write a position_deliveries row, POST, update status; a cron-triggered
 * redelivery drains anything left pending. Sizing/book-building is portfolio's
 * concern — a delivery failure must not fail signal registration here.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema, deliverJson, config, type TradingSignalDTO } from "@qt/shared";
import { log } from "./log.js";

const { positionDeliveries, tradingSignals } = dbSchema;

export async function deliverPosition(signal: TradingSignalDTO): Promise<boolean> {
  await db()
    .insert(positionDeliveries)
    .values({ signalId: signal.id })
    .onConflictDoNothing({ target: positionDeliveries.signalId });

  const url = `${config.portfolioUrl()}/signals`;
  const res = await deliverJson(url, signal, { idempotencyKey: signal.id });

  await db()
    .update(positionDeliveries)
    .set({
      deliveryStatus: res.ok ? "delivered" : "pending",
      lastError: res.ok ? null : res.error ?? `status ${res.status}`,
    })
    .where(eq(positionDeliveries.signalId, signal.id));
  if (res.ok) {
    log.info("deliver.position.ok", { signal: signal.id, symbol: signal.symbol, to: url, status: res.status });
  } else {
    log.warn("deliver.position.pending", {
      signal: signal.id,
      symbol: signal.symbol,
      to: url,
      status: res.status,
      error: res.error,
    });
  }
  return res.ok;
}

export async function redeliverPendingPositions(limit = 100): Promise<{ tried: number; delivered: number }> {
  const pending = await db()
    .select({ signalId: positionDeliveries.signalId })
    .from(positionDeliveries)
    .where(eq(positionDeliveries.deliveryStatus, "pending"))
    .limit(limit);

  let delivered = 0;
  for (const { signalId } of pending) {
    const rows = await db().select().from(tradingSignals).where(eq(tradingSignals.id, signalId));
    const s = rows[0];
    if (!s) continue;
    if (await deliverPosition(rowToDto(s))) delivered++;
  }
  return { tried: pending.length, delivered };
}

function rowToDto(s: typeof tradingSignals.$inferSelect): TradingSignalDTO {
  return {
    id: s.id,
    notification_id: s.notificationId,
    event_id: s.eventId,
    symbol: s.symbol,
    direction: s.direction as TradingSignalDTO["direction"],
    target_price: s.targetPrice,
    stop_loss: s.stopLoss,
    horizon_days: s.horizonDays,
    conviction: (s.conviction ?? "medium") as TradingSignalDTO["conviction"],
    entry_price: s.entryPrice,
    fair_value_base: s.fairValueBase,
    deviation_pct: s.deviationPct,
    thesis: s.thesis,
    generated_by: (s.generatedBy ?? "llm") as TradingSignalDTO["generated_by"],
    snapshot_id: s.snapshotId,
    status: s.status as TradingSignalDTO["status"],
    created_at: s.createdAt.toISOString(),
    expires_at: s.expiresAt ? s.expiresAt.toISOString() : null,
  };
}
