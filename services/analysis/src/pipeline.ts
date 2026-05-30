/**
 * The closed-loop event pipeline (two-phase, ported from
 * legends/quant-researcher/quant_researcher/service/agent/pipeline.py):
 *   Tx1: locate/record event by (source, external_id); dedup; noise short-circuit
 *   slow: reference valuation + agent reprice (no tx held across the network)
 *   Tx2: persist trading signal, mark event done
 * Then deliver the signal to evaluation (outbox). Idempotent on the dedup key.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, dbSchema, type EventPayload, type TradingSignalDTO } from "@qt/shared";
import { classify } from "./classify.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { generateSignal } from "./agent.js";
import { deliverSignal, rowToDto } from "./deliver.js";

const { events, tradingSignals } = dbSchema;

export type RunResult =
  | { status: "noise"; event_id: string }
  | { status: "duplicate"; event_id: string; signal: TradingSignalDTO }
  | { status: "signal"; event_id: string; signal: TradingSignalDTO };

async function findOrInsertEvent(p: EventPayload): Promise<string> {
  const existing = await db()
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.source, p.source), eq(events.externalId, p.external_id)));
  if (existing[0]) return existing[0].id;

  const id = randomUUID();
  await db()
    .insert(events)
    .values({
      id,
      source: p.source,
      externalId: p.external_id,
      symbol: p.symbol,
      eventType: String(p.event_type),
      directionHint: p.direction_hint ?? null,
      headline: p.headline ?? null,
      raw: p.raw,
      observedAt: p.observed_at ? new Date(p.observed_at) : null,
      deliveryStatus: "delivered", // arrived via HTTP
    })
    .onConflictDoNothing({ target: [events.source, events.externalId] });
  return id;
}

export async function runEvent(p: EventPayload): Promise<RunResult> {
  const eventId = await findOrInsertEvent(p);

  // Idempotency: if a signal already exists for this event, return it.
  const prior = await db().select().from(tradingSignals).where(eq(tradingSignals.eventId, eventId));
  if (prior[0]) {
    return { status: "duplicate", event_id: eventId, signal: rowToDto(prior[0]) };
  }

  const norm = classify(p);
  if (!norm) {
    await db().update(events).set({ status: "noise" }).where(eq(events.id, eventId));
    return { status: "noise", event_id: eventId };
  }

  await db().update(events).set({ status: "processing" }).where(eq(events.id, eventId));

  // Slow phase — no open transaction.
  const ref = await computeReferenceValuation(norm.symbol);
  const draft = await generateSignal(norm, ref);

  const entryPrice = ref.current_price;
  const fairValueBase = ref.fair_value_per_share;
  const deviationPct =
    entryPrice && fairValueBase ? (fairValueBase / entryPrice - 1) * 100 : null;
  const createdAt = new Date();
  const expiresAt = draft.horizon_days
    ? new Date(createdAt.getTime() + draft.horizon_days * 24 * 3600 * 1000)
    : null;

  const id = randomUUID();
  const [row] = await db()
    .insert(tradingSignals)
    .values({
      id,
      eventId,
      symbol: norm.symbol,
      direction: draft.direction,
      targetPrice: draft.target_price,
      stopLoss: draft.stop_loss,
      horizonDays: draft.horizon_days,
      conviction: draft.conviction,
      entryPrice,
      fairValueBase,
      deviationPct,
      thesis: draft.thesis,
      generatedBy: "llm",
      snapshotId: ref.snapshot_id,
      status: "open",
      createdAt,
      expiresAt,
    })
    .returning();

  await db().update(events).set({ status: "done" }).where(eq(events.id, eventId));

  const dto = rowToDto(row!);
  await deliverSignal(dto);
  return { status: "signal", event_id: eventId, signal: dto };
}
