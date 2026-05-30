/**
 * The closed-loop event pipeline (two-phase, ported from
 * legends/quant-researcher/quant_researcher/service/agent/pipeline.py):
 *   intake (fast):  locate/record event by (source, external_id); dedup; noise
 *                   short-circuit; mark `processing`. Cheap DB-only work.
 *   process (slow): reference valuation + agent reprice (no tx across network);
 *                   persist trading signal, mark `done`; deliver to evaluation.
 *
 * The HTTP handler awaits intake then ACKs 202 and runs process() in the
 * background, so the producer (ingestion) is never blocked on the LLM. If a
 * background run dies (e.g. instance shutdown), the event is left in
 * `processing` and recovered by reprocessStuck() — this preserves at-least-once
 * without the producer having to retry. Idempotent on the dedup key throughout.
 */
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, dbSchema, type EventPayload, type TradingSignalDTO } from "@qt/shared";
import { classify, type NormalizedEvent } from "./classify.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { generateSignal } from "./agent.js";
import { deliverSignal, rowToDto } from "./deliver.js";
import { log } from "./log.js";

const { events, tradingSignals } = dbSchema;

export type IntakeResult =
  | { status: "noise"; event_id: string }
  | { status: "duplicate"; event_id: string; signal: TradingSignalDTO }
  | { status: "accepted"; event_id: string; norm: NormalizedEvent };

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

/**
 * Fast phase: persist + dedup + classify, mark `processing`. No network/LLM, so
 * it returns well within the producer's delivery timeout. The caller ACKs after
 * this and runs processEvent() in the background.
 */
export async function intakeEvent(p: EventPayload): Promise<IntakeResult> {
  const eventId = await findOrInsertEvent(p);

  // Idempotency: if a signal already exists for this event, return it.
  const prior = await db().select().from(tradingSignals).where(eq(tradingSignals.eventId, eventId));
  if (prior[0]) {
    log.info("pipeline.duplicate", { event_id: eventId, external_id: p.external_id, signal: prior[0].id });
    return { status: "duplicate", event_id: eventId, signal: rowToDto(prior[0]) };
  }

  const norm = classify(p);
  if (!norm) {
    await db().update(events).set({ status: "noise" }).where(eq(events.id, eventId));
    log.info("pipeline.noise", { event_id: eventId, external_id: p.external_id, type: p.event_type });
    return { status: "noise", event_id: eventId };
  }

  // Refresh ingestedAt when entering processing: it doubles as the "processing
  // since" clock for reprocessStuck. Without this, a re-delivered event (whose
  // ingestedAt is the original, possibly >cutoff) would be grabbed by reprocess
  // the instant intake marks it processing — racing the background processEvent.
  await db()
    .update(events)
    .set({ status: "processing", ingestedAt: new Date() })
    .where(eq(events.id, eventId));
  log.info("pipeline.processing", { event_id: eventId, symbol: norm.symbol, type: norm.eventType });
  return { status: "accepted", event_id: eventId, norm };
}

/**
 * Slow phase: reference valuation + agent reprice + persist signal + deliver.
 * Safe to call from the request handler (background) or from reprocessStuck().
 */
export async function processEvent(eventId: string, norm: NormalizedEvent): Promise<TradingSignalDTO> {
  const ref = await computeReferenceValuation(norm.symbol);
  log.info("pipeline.reference", {
    symbol: norm.symbol,
    snapshot: ref.snapshot_id,
    price: ref.current_price,
    fair_value: ref.fair_value_per_share,
    verdict: ref.verdict,
  });
  const draft = await generateSignal(norm, ref);
  log.info("pipeline.drafted", {
    symbol: norm.symbol,
    direction: draft.direction,
    conviction: draft.conviction,
    target: draft.target_price,
  });

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
    .onConflictDoNothing({ target: tradingSignals.eventId })
    .returning();

  // Lost a race: a concurrent processEvent already created the signal for this
  // event (one-signal-per-event). Return the winner's row; it handles delivery.
  if (!row) {
    const [existing] = await db()
      .select()
      .from(tradingSignals)
      .where(eq(tradingSignals.eventId, eventId));
    log.info("pipeline.signal.dup", { event_id: eventId, signal: existing?.id });
    return rowToDto(existing!);
  }

  await db().update(events).set({ status: "done" }).where(eq(events.id, eventId));
  log.info("pipeline.signal", {
    event_id: eventId,
    signal: id,
    symbol: norm.symbol,
    direction: draft.direction,
    conviction: draft.conviction,
  });

  const dto = rowToDto(row!);
  await deliverSignal(dto);
  return dto;
}

/** Reconstruct the wire payload from a stored event row (for recovery). */
function rowToPayload(row: typeof events.$inferSelect): EventPayload {
  return {
    source: row.source,
    external_id: row.externalId,
    symbol: row.symbol ?? "",
    event_type: row.eventType ?? "",
    direction_hint: (row.directionHint as EventPayload["direction_hint"]) ?? null,
    headline: row.headline,
    observed_at: row.observedAt ? row.observedAt.toISOString() : null,
    raw: (row.raw as Record<string, unknown>) ?? {},
  };
}

/**
 * Recover events stuck in `processing` (background run died before persisting a
 * signal). Cron-triggered. The age cutoff keeps in-flight events untouched, so
 * a normal ~20s LLM run is never double-processed. Mirrors ingestion's
 * redelivery: the analysis-side safety net that makes async ACK at-least-once.
 *
 * `limit` is deliberately small and processing is sequential: each processEvent
 * runs the slow LLM loop (~15-20s), so a large batch would blow the cron HTTP
 * timeout, and sequential keeps us under the FMP/Anthropic rate limits. A
 * backlog larger than `limit` simply drains over successive cron fires (logged).
 */
export async function reprocessStuck(
  limit = 5,
  olderThanMs = 5 * 60 * 1000,
): Promise<{ tried: number; recovered: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  // Fetch limit+1 to detect (and surface) a backlog without a separate count.
  const candidates = await db()
    .select()
    .from(events)
    .where(and(eq(events.status, "processing"), lt(events.ingestedAt, cutoff)))
    .limit(limit + 1);
  const stuck = candidates.slice(0, limit);
  if (stuck.length) {
    log.info("reprocess.start", { stuck: stuck.length, more: candidates.length > limit });
  }

  let recovered = 0;
  let tried = 0;
  for (const row of stuck) {
    // Atomically claim: flip the clock only if it's still processing AND still
    // past the cutoff. A concurrent cron run (or a fresh re-delivery that just
    // reset ingestedAt) fails this guard and is skipped — no double-processing.
    const claimed = await db()
      .update(events)
      .set({ ingestedAt: new Date() })
      .where(and(eq(events.id, row.id), eq(events.status, "processing"), lt(events.ingestedAt, cutoff)))
      .returning({ id: events.id });
    if (!claimed[0]) continue;
    tried++;

    // Already done in a prior run? Reconcile status and skip.
    const prior = await db()
      .select({ id: tradingSignals.id })
      .from(tradingSignals)
      .where(eq(tradingSignals.eventId, row.id));
    if (prior[0]) {
      await db().update(events).set({ status: "done" }).where(eq(events.id, row.id));
      continue;
    }
    const norm = classify(rowToPayload(row));
    if (!norm) {
      await db().update(events).set({ status: "noise" }).where(eq(events.id, row.id));
      continue;
    }
    try {
      await processEvent(row.id, norm);
      recovered++;
    } catch (err) {
      log.error("reprocess.failed", {
        event_id: row.id,
        symbol: norm.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { tried, recovered };
}
