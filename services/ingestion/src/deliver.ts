/**
 * Outbox-backed event delivery. Within one transaction we upsert the raw event
 * (dedup on source+external_id). Then we POST it to analysis; success marks the
 * row delivered, failure leaves it `pending` for /internal/redeliver to retry.
 * This gives at-least-once without a message queue; the consumer is idempotent.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, dbSchema, deliverJson, config, type EventPayload } from "@qt/shared";
import { log } from "./log.js";

const { events } = dbSchema;

export interface PersistResult {
  id: string;
  inserted: boolean;
  /** Existing row's outbox status when this was a dup; "pending" for fresh inserts. */
  deliveryStatus: string;
}

/** Upsert an event row (idempotent on source+external_id). Returns its id. */
export async function persistEvent(p: EventPayload): Promise<PersistResult> {
  const id = randomUUID();
  const rows = await db()
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
    })
    .onConflictDoNothing({ target: [events.source, events.externalId] })
    .returning({ id: events.id });

  if (rows.length > 0) return { id: rows[0]!.id, inserted: true, deliveryStatus: "pending" };

  const existing = await db()
    .select({ id: events.id, deliveryStatus: events.deliveryStatus })
    .from(events)
    .where(and(eq(events.source, p.source), eq(events.externalId, p.external_id)));
  return { id: existing[0]!.id, inserted: false, deliveryStatus: existing[0]!.deliveryStatus };
}

/** Deliver one stored event to analysis and update its outbox status. */
export async function deliverEvent(id: string, p: EventPayload): Promise<boolean> {
  const url = `${config.analysisUrl()}/events`;
  const res = await deliverJson(url, p, {
    idempotencyKey: `${p.source}:${p.external_id}`,
  });
  await db()
    .update(events)
    .set({
      deliveryStatus: res.ok ? "delivered" : "pending",
      deliveryAttempts: (await currentAttempts(id)) + 1,
      lastError: res.ok ? null : res.error ?? `status ${res.status}`,
    })
    .where(eq(events.id, id));
  if (res.ok) {
    log.info("deliver.event.ok", { external_id: p.external_id, symbol: p.symbol, to: url, status: res.status });
  } else {
    log.warn("deliver.event.pending", {
      external_id: p.external_id,
      symbol: p.symbol,
      to: url,
      status: res.status,
      error: res.error,
    });
  }
  return res.ok;
}

async function currentAttempts(id: string): Promise<number> {
  const r = await db()
    .select({ n: events.deliveryAttempts })
    .from(events)
    .where(eq(events.id, id));
  return r[0]?.n ?? 0;
}

/** Persist + immediately attempt delivery. */
export async function ingestAndDeliver(p: EventPayload): Promise<{ id: string; delivered: boolean }> {
  const { id, inserted, deliveryStatus } = await persistEvent(p);
  // Already-delivered dup: skip re-delivery. Re-sending it every poll just makes
  // analysis re-do intake (and races its in-flight processing). Fresh inserts and
  // rows still `pending` from a failed prior attempt DO (re)deliver.
  if (!inserted && deliveryStatus === "delivered") {
    log.info("ingest.event.dup", {
      event_id: id,
      external_id: p.external_id,
      symbol: p.symbol,
      type: p.event_type,
      skipped: true,
    });
    return { id, delivered: true };
  }
  log.info(inserted ? "ingest.event.new" : "ingest.event.dup", {
    event_id: id,
    external_id: p.external_id,
    symbol: p.symbol,
    type: p.event_type,
  });
  const delivered = await deliverEvent(id, p);
  return { id, delivered };
}

/**
 * Persist + deliver many events with bounded concurrency. News pulls can be
 * 100s of events; doing them fully serially risks Cloud Run / Scheduler
 * timeouts, while unbounded concurrency would swamp the DB pool (max 5) and
 * analysis. Batches of `batchSize` balance throughput against both. Returns the
 * delivered count.
 */
export async function ingestAndDeliverAll(
  payloads: EventPayload[],
  batchSize = 10,
): Promise<number> {
  let delivered = 0;
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const res = await Promise.all(batch.map((p) => ingestAndDeliver(p)));
    delivered += res.filter((r) => r.delivered).length;
  }
  return delivered;
}

/** Reconstruct the wire payload from a stored event row. */
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

/** Retry all pending deliveries (cron-triggered). Returns counts. */
export async function redeliverPending(limit = 100): Promise<{ tried: number; delivered: number }> {
  const pending = await db()
    .select()
    .from(events)
    .where(eq(events.deliveryStatus, "pending"))
    .limit(limit);
  if (pending.length) log.info("redeliver.start", { pending: pending.length });
  let delivered = 0;
  for (const row of pending) {
    if (await deliverEvent(row.id, rowToPayload(row))) delivered++;
  }
  return { tried: pending.length, delivered };
}
