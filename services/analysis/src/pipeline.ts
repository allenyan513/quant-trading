/**
 * The closed-loop notification pipeline (two-phase, ported from
 * legends/quant-researcher/quant_researcher/service/agent/pipeline.py):
 *   intake (fast):  locate the notification by (source, batch_key); dedup; noise
 *                   short-circuit; mark `processing`. Cheap DB-only work.
 *   process (slow): reference valuation + agent reprice (no tx across network);
 *                   persist one trading signal, mark `done`; deliver to evaluation.
 *
 * A notification bundles 1..N raw events sharing (symbol, event_type); analysis
 * reprices the whole bundle into ONE signal (uq_signals_notification).
 *
 * The HTTP handler awaits intake then ACKs 202 and runs process() in the
 * background, so the producer (ingestion) is never blocked on the LLM. If a
 * background run dies, the notification is left in `processing` and recovered by
 * reprocessStuck(). Idempotent on (source, batch_key) throughout.
 */
import { randomUUID } from "node:crypto";
import { and, eq, lt, inArray } from "drizzle-orm";
import { db, dbSchema, type NotificationPayload, type TradingSignalDTO } from "@qt/shared";
import { classifyNotification, type NormalizedNotification, type NormalizedEvent } from "./classify.js";
import { computeReferenceValuation } from "./valuation/reference.js";
import { generateSignal } from "./agent.js";
import { deliverSignal, rowToDto } from "./deliver.js";
import { log } from "./log.js";

const { events, notifications, tradingSignals } = dbSchema;

export type IntakeResult =
  | { status: "noise"; notification_id: string }
  | { status: "duplicate"; notification_id: string; signal: TradingSignalDTO }
  | { status: "accepted"; notification_id: string; norm: NormalizedNotification };

/**
 * Locate the notification row. In v1 (shared DB) ingestion has already written
 * it before POSTing, so this is normally a lookup. The insert is a fallback for
 * a future non-shared DB: it resolves member event ids from the raw `events`.
 */
async function findOrInsertNotification(p: NotificationPayload): Promise<string> {
  const existing = await db()
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.source, p.source), eq(notifications.batchKey, p.batch_key)));
  if (existing[0]) return existing[0].id;

  const externalIds = p.events.map((e) => e.external_id);
  const rows = externalIds.length
    ? await db()
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.source, p.source), inArray(events.externalId, externalIds)))
    : [];
  const id = randomUUID();
  const ins = await db()
    .insert(notifications)
    .values({
      id,
      source: p.source,
      batchKey: p.batch_key,
      symbol: p.symbol,
      eventType: String(p.event_type),
      eventIds: rows.map((r) => r.id),
      count: p.events.length,
      summary: p.summary ?? null,
      deliveryStatus: "delivered", // arrived via HTTP
    })
    .onConflictDoNothing({ target: [notifications.source, notifications.batchKey] })
    .returning({ id: notifications.id });
  if (ins[0]) return ins[0].id;

  // Lost the insert race: another arrival created it. Read the winner's id.
  const after = await db()
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.source, p.source), eq(notifications.batchKey, p.batch_key)));
  return after[0]!.id;
}

/**
 * Fast phase: locate + dedup + classify, mark `processing`. No network/LLM, so
 * it returns well within the producer's delivery timeout. The caller ACKs after
 * this and runs processNotification() in the background.
 */
export async function intakeNotification(p: NotificationPayload): Promise<IntakeResult> {
  const notifId = await findOrInsertNotification(p);

  // Idempotency: if a signal already exists for this notification, return it.
  const prior = await db()
    .select()
    .from(tradingSignals)
    .where(eq(tradingSignals.notificationId, notifId));
  if (prior[0]) {
    log.info("pipeline.duplicate", { notification_id: notifId, batch_key: p.batch_key, signal: prior[0].id });
    return { status: "duplicate", notification_id: notifId, signal: rowToDto(prior[0]) };
  }

  const norm = classifyNotification(p);
  if (!norm) {
    await db().update(notifications).set({ status: "noise" }).where(eq(notifications.id, notifId));
    log.info("pipeline.noise", { notification_id: notifId, batch_key: p.batch_key, type: p.event_type });
    return { status: "noise", notification_id: notifId };
  }

  // Refresh ingestedAt when entering processing: it doubles as the "processing
  // since" clock for reprocessStuck (see the events-era note — same rationale).
  await db()
    .update(notifications)
    .set({ status: "processing", ingestedAt: new Date() })
    .where(eq(notifications.id, notifId));
  log.info("pipeline.processing", {
    notification_id: notifId,
    symbol: norm.symbol,
    type: norm.eventType,
    count: norm.events.length,
  });
  return { status: "accepted", notification_id: notifId, norm };
}

/**
 * Slow phase: reference valuation + agent reprice + persist signal + deliver.
 * Safe to call from the request handler (background) or from reprocessStuck().
 */
export async function processNotification(
  notifId: string,
  norm: NormalizedNotification,
): Promise<TradingSignalDTO> {
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
      notificationId: notifId,
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
    .onConflictDoNothing({ target: tradingSignals.notificationId })
    .returning();

  // Lost a race: a concurrent processNotification already created the signal for
  // this notification (one-signal-per-notification). Return the winner's row.
  if (!row) {
    const [existing] = await db()
      .select()
      .from(tradingSignals)
      .where(eq(tradingSignals.notificationId, notifId));
    log.info("pipeline.signal.dup", { notification_id: notifId, signal: existing?.id });
    return rowToDto(existing!);
  }

  await db().update(notifications).set({ status: "done" }).where(eq(notifications.id, notifId));
  log.info("pipeline.signal", {
    notification_id: notifId,
    signal: id,
    symbol: norm.symbol,
    direction: draft.direction,
    conviction: draft.conviction,
  });

  const dto = rowToDto(row!);
  await deliverSignal(dto);
  return dto;
}

/** Rebuild a NormalizedNotification from a stored row + its member events (for recovery). */
async function rowToNormalized(
  n: typeof notifications.$inferSelect,
): Promise<NormalizedNotification | null> {
  const eventIds = (n.eventIds as string[]) ?? [];
  const rows = eventIds.length
    ? await db().select().from(events).where(inArray(events.id, eventIds))
    : [];
  // `inArray` doesn't preserve order; re-key by eventIds so the bundle keeps its
  // original newest-first ordering (matches the initial processing run).
  const byId = new Map(rows.map((r) => [r.id, r]));
  const refs = eventIds
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => !!r)
    .map((r) => ({
      external_id: r.externalId,
      direction_hint: (r.directionHint as NormalizedEvent["directionHint"]) ?? null,
      headline: r.headline,
      observed_at: r.observedAt ? r.observedAt.toISOString() : null,
      raw: (r.raw as Record<string, unknown>) ?? {},
    }));
  return classifyNotification({
    source: n.source,
    batch_key: n.batchKey,
    symbol: n.symbol,
    event_type: n.eventType,
    summary: n.summary,
    events: refs,
  });
}

/**
 * Recover notifications stuck in `processing` (background run died before
 * persisting a signal). Cron-triggered. The age cutoff keeps in-flight work
 * untouched, so a normal ~20s LLM run is never double-processed. Mirrors
 * ingestion's redelivery: the analysis-side safety net that makes async ACK
 * at-least-once.
 *
 * `limit` is deliberately small and processing is sequential: each run is a slow
 * LLM loop (~15-20s), so a large batch would blow the cron HTTP timeout. A
 * backlog larger than `limit` drains over successive cron fires (logged).
 */
export async function reprocessStuck(
  limit = 5,
  olderThanMs = 5 * 60 * 1000,
): Promise<{ tried: number; recovered: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const candidates = await db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "processing"), lt(notifications.ingestedAt, cutoff)))
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
      .update(notifications)
      .set({ ingestedAt: new Date() })
      .where(
        and(
          eq(notifications.id, row.id),
          eq(notifications.status, "processing"),
          lt(notifications.ingestedAt, cutoff),
        ),
      )
      .returning({ id: notifications.id });
    if (!claimed[0]) continue;
    tried++;

    // Already done in a prior run? Reconcile status and skip.
    const prior = await db()
      .select({ id: tradingSignals.id })
      .from(tradingSignals)
      .where(eq(tradingSignals.notificationId, row.id));
    if (prior[0]) {
      await db().update(notifications).set({ status: "done" }).where(eq(notifications.id, row.id));
      continue;
    }
    const norm = await rowToNormalized(row);
    if (!norm) {
      await db().update(notifications).set({ status: "noise" }).where(eq(notifications.id, row.id));
      continue;
    }
    try {
      await processNotification(row.id, norm);
      recovered++;
    } catch (err) {
      log.error("reprocess.failed", {
        notification_id: row.id,
        symbol: norm.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { tried, recovered };
}
