/**
 * Outbox-backed delivery of a trading signal to the evaluation service. Mirrors
 * the ingestion outbox: write a signal_deliveries row, POST, update status; a
 * cron-triggered redelivery drains anything left pending.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema, deliverJson, config, type TradingSignalDTO } from "@qt/shared";
import { log } from "./log.js";

const { signalDeliveries, tradingSignals } = dbSchema;

export async function deliverSignal(signal: TradingSignalDTO): Promise<boolean> {
  await db()
    .insert(signalDeliveries)
    .values({ signalId: signal.id })
    .onConflictDoNothing({ target: signalDeliveries.signalId });

  const url = `${config.evaluationUrl()}/signals`;
  const res = await deliverJson(url, signal, {
    idempotencyKey: signal.id,
  });

  await db()
    .update(signalDeliveries)
    .set({
      deliveryStatus: res.ok ? "delivered" : "pending",
      lastError: res.ok ? null : res.error ?? `status ${res.status}`,
    })
    .where(eq(signalDeliveries.signalId, signal.id));
  if (res.ok) {
    log.info("deliver.signal.ok", { signal: signal.id, symbol: signal.symbol, to: url, status: res.status });
  } else {
    log.warn("deliver.signal.pending", {
      signal: signal.id,
      symbol: signal.symbol,
      to: url,
      status: res.status,
      error: res.error,
    });
  }
  return res.ok;
}

export async function redeliverPendingSignals(limit = 100): Promise<{ tried: number; delivered: number }> {
  const pending = await db()
    .select({ signalId: signalDeliveries.signalId })
    .from(signalDeliveries)
    .where(eq(signalDeliveries.deliveryStatus, "pending"))
    .limit(limit);

  let delivered = 0;
  for (const { signalId } of pending) {
    const rows = await db().select().from(tradingSignals).where(eq(tradingSignals.id, signalId));
    const s = rows[0];
    if (!s) continue;
    const dto = rowToDto(s);
    if (await deliverSignal(dto)) delivered++;
  }
  return { tried: pending.length, delivered };
}

export function rowToDto(s: typeof tradingSignals.$inferSelect): TradingSignalDTO {
  return {
    id: s.id,
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
