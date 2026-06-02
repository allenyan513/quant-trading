/**
 * Outbox-backed event intake + aggregated notification delivery.
 *
 * A pull persists EVERY qualified event (dedup on source+external_id) — nothing
 * is collapsed away. The not-yet-delivered events are then grouped by
 * (symbol, event_type) and each group is delivered to alpha as ONE
 * `notification` (e.g. "NVDA: 3 grade changes"), so alpha reprices the whole
 * bundle into a single signal instead of fighting N near-simultaneous events.
 *
 * Two outbox layers, both at-least-once:
 *   - events.delivery_status: "have we told alpha about this raw event yet".
 *     Flipped to `delivered` only when the notification carrying it succeeds.
 *   - notifications.delivery_status: the POST itself; `pending` ones are retried
 *     by /internal/redeliver. The consumer (alpha) dedups on (source, batch_key).
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  dbSchema,
  deliverJson,
  config,
  type EventPayload,
  type EventRef,
  type NotificationPayload,
} from "@qt/shared";
import { log } from "./log.js";

const { events, notifications } = dbSchema;

export interface PersistResult {
  id: string;
  inserted: boolean;
  /** Existing row's outbox status when this was a dup; "pending" for fresh inserts. */
  deliveryStatus: string;
}

/** Upsert an event row (idempotent on source+external_id). Returns its id + dup status. */
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

const ts = (s?: string | null): number => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

function toEventRef(p: EventPayload): EventRef {
  return {
    external_id: p.external_id,
    direction_hint: p.direction_hint ?? null,
    headline: p.headline ?? null,
    observed_at: p.observed_at ?? null,
    raw: p.raw,
  };
}

function rowToEventRef(r: typeof events.$inferSelect): EventRef {
  return {
    external_id: r.externalId,
    direction_hint: (r.directionHint as EventRef["direction_hint"]) ?? null,
    headline: r.headline,
    observed_at: r.observedAt ? r.observedAt.toISOString() : null,
    raw: (r.raw as Record<string, unknown>) ?? {},
  };
}

/**
 * Deterministic id for a batch: hash of source+symbol+type+the sorted member
 * ids. JSON-encoded (not joined) so an external_id containing the separator
 * char — e.g. an analyst company with a space — can't alias a different set.
 */
export function batchKeyOf(source: string, symbol: string, eventType: string, externalIds: string[]): string {
  const h = createHash("sha256");
  h.update(JSON.stringify([source, symbol, eventType, [...externalIds].sort()]));
  return h.digest("hex").slice(0, 32);
}

async function currentAttempts(notifId: string): Promise<number> {
  const r = await db()
    .select({ n: notifications.deliveryAttempts })
    .from(notifications)
    .where(eq(notifications.id, notifId));
  return r[0]?.n ?? 0;
}

async function markEventsDelivered(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  await db().update(events).set({ deliveryStatus: "delivered" }).where(inArray(events.id, eventIds));
}

/** Deliver one stored notification to alpha and update its + its events' outbox. */
async function deliverNotification(
  notifId: string,
  payload: NotificationPayload,
  eventIds: string[],
): Promise<boolean> {
  const url = `${config.alphaUrl()}/notifications`;
  const res = await deliverJson(url, payload, { idempotencyKey: `${payload.source}:${payload.batch_key}` });
  await db()
    .update(notifications)
    .set({
      deliveryStatus: res.ok ? "delivered" : "pending",
      deliveryAttempts: (await currentAttempts(notifId)) + 1,
      lastError: res.ok ? null : res.error ?? `status ${res.status}`,
    })
    .where(eq(notifications.id, notifId));
  if (res.ok) {
    await markEventsDelivered(eventIds);
    log.info("deliver.notification.ok", {
      batch_key: payload.batch_key,
      symbol: payload.symbol,
      type: payload.event_type,
      count: eventIds.length,
      to: url,
      status: res.status,
    });
  } else {
    log.warn("deliver.notification.pending", {
      batch_key: payload.batch_key,
      symbol: payload.symbol,
      type: payload.event_type,
      to: url,
      status: res.status,
      error: res.error,
    });
  }
  return res.ok;
}

/**
 * Build (idempotently) and deliver one notification for a group of to-notify
 * events that all share (symbol, event_type). Returns whether it was delivered.
 */
async function buildAndDeliverNotification(
  items: Array<{ id: string; payload: EventPayload }>,
): Promise<boolean> {
  const first = items[0]!.payload;
  const source = first.source;
  const symbol = first.symbol;
  const eventType = String(first.event_type);

  // Newest-first so the bundle leads with the freshest change.
  const sorted = [...items].sort((a, b) => ts(b.payload.observed_at) - ts(a.payload.observed_at));
  const externalIds = sorted.map((i) => i.payload.external_id);
  const eventIds = sorted.map((i) => i.id);
  const batchKey = batchKeyOf(source, symbol, eventType, externalIds);
  const summary = `${symbol}: ${items.length} ${eventType}${items.length > 1 ? "s" : ""}`;
  const observedAt = sorted[0]!.payload.observed_at ? new Date(sorted[0]!.payload.observed_at!) : null;

  const id = randomUUID();
  const ins = await db()
    .insert(notifications)
    .values({ id, source, batchKey, symbol, eventType, eventIds, count: items.length, summary, observedAt })
    .onConflictDoNothing({ target: [notifications.source, notifications.batchKey] })
    .returning({ id: notifications.id });

  let notifId = ins[0]?.id;
  if (!notifId) {
    // Same batch already exists (a prior attempt for this exact event set).
    const existing = await db()
      .select({ id: notifications.id, deliveryStatus: notifications.deliveryStatus })
      .from(notifications)
      .where(and(eq(notifications.source, source), eq(notifications.batchKey, batchKey)));
    if (existing[0]?.deliveryStatus === "delivered") {
      await markEventsDelivered(eventIds); // reconcile any events still flagged pending
      log.info("notification.dup", { batch_key: batchKey, symbol, type: eventType, count: items.length, skipped: true });
      return true;
    }
    notifId = existing[0]!.id;
  }

  const payload: NotificationPayload = {
    source,
    batch_key: batchKey,
    symbol,
    event_type: eventType,
    summary,
    events: sorted.map((i) => toEventRef(i.payload)),
  };
  return deliverNotification(notifId, payload, eventIds);
}

export interface IngestResult {
  /** Events newly carried to alpha (in a delivered notification). */
  delivered: number;
  /** Events skipped because a prior notification already delivered them. */
  skipped: number;
  /** Notifications sent (one per (symbol, event_type) group). */
  notifications: number;
}

/**
 * Persist all qualified events, then deliver one aggregated notification per
 * (symbol, event_type) group of not-yet-delivered events.
 *
 * To-notify = freshly inserted OR existing-but-still-`pending`. Already-delivered
 * events are skipped (their notification went out before). Re-grouping a pending
 * event is intentional (no silent drop); the deterministic batch_key dedups the
 * common re-pull case, and any rare overlap is absorbed by the consumer's
 * idempotency — at-least-once, never at-most-once.
 */
export async function ingestAndNotifyAll(payloads: EventPayload[], batchSize = 10): Promise<IngestResult> {
  const toNotify: Array<{ id: string; payload: EventPayload }> = [];
  let skipped = 0;
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((p) => persistEvent(p).then((r) => ({ r, p }))));
    for (const { r, p } of results) {
      if (r.inserted || r.deliveryStatus === "pending") toNotify.push({ id: r.id, payload: p });
      else skipped++;
    }
  }

  // Group the to-notify events by (symbol, event_type).
  const groups = new Map<string, Array<{ id: string; payload: EventPayload }>>();
  for (const item of toNotify) {
    const key = `${item.payload.symbol} ${String(item.payload.event_type)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(item);
  }

  // Deliver notifications with the same bounded concurrency as the persist step,
  // so a watchlist with many symbols doesn't serialize into a Scheduler timeout.
  let delivered = 0;
  const groupItems = [...groups.values()];
  for (let i = 0; i < groupItems.length; i += batchSize) {
    const batch = groupItems.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((items) => buildAndDeliverNotification(items)));
    results.forEach((ok, j) => {
      if (ok) delivered += batch[j]!.length;
    });
  }
  return { delivered, skipped, notifications: groups.size };
}

/** Reconstruct a notification's wire payload from its stored row + member events. */
async function rowToPayload(n: typeof notifications.$inferSelect): Promise<NotificationPayload> {
  const eventIds = (n.eventIds as string[]) ?? [];
  const rows = eventIds.length
    ? await db().select().from(events).where(inArray(events.id, eventIds))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const refs = eventIds.map((id) => byId.get(id)).filter((r): r is typeof rows[number] => !!r).map(rowToEventRef);
  return { source: n.source, batch_key: n.batchKey, symbol: n.symbol, event_type: n.eventType, summary: n.summary, events: refs };
}

/** Retry all pending notification deliveries (cron-triggered). Returns counts. */
export async function redeliverPending(limit = 100): Promise<{ tried: number; delivered: number }> {
  const pending = await db()
    .select()
    .from(notifications)
    .where(eq(notifications.deliveryStatus, "pending"))
    .limit(limit);
  if (pending.length) log.info("redeliver.start", { pending: pending.length });
  let delivered = 0;
  for (const n of pending) {
    const payload = await rowToPayload(n);
    if (await deliverNotification(n.id, payload, (n.eventIds as string[]) ?? [])) delivered++;
  }
  return { tried: pending.length, delivered };
}
