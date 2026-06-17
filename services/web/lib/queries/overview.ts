/**
 * Read queries: per-service liveness + the cross-pipeline overview funnel.
 * All read-only. Run on the Node runtime (route handlers), never in the Edge
 * middleware.
 */

import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, events, notifications, tradingSignals, signalDeliveries, positions, logs } from "../db.js";

const SERVICES = ["data", "alpha", "portfolio"] as const;
const STUCK_MINUTES = 5;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

/** Map a service's last-log timestamp to a liveness state. Shared so the nav
 * health dots and the overview heartbeats never drift apart. */
export function heartbeatState(last: string | null): string {
  if (!last) return "unknown";
  const ageMs = Date.now() - new Date(last).getTime();
  return ageMs < 5 * 60_000 ? "up" : ageMs < 60 * 60_000 ? "idle" : "stale";
}

/** Per-service liveness from the last structured log row. Cheap enough to poll
 * from the global nav (one grouped scan over `logs`). */
export async function getHeartbeats() {
  const rows = await db()
    .select({ service: logs.service, last: sql<string>`max(${logs.ts})` })
    .from(logs)
    .groupBy(logs.service);
  return SERVICES.map((service) => {
    const last = rows.find((r) => r.service === service)?.last ?? null;
    return { service, last, state: heartbeatState(last) };
  });
}

/** Fold [{k, c}] grouped-count rows into a {status: count} map. */
function toMap(rows: { k: string | null; c: number | string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.k ?? "unknown"] = Number(r.c);
  return out;
}

export async function getOverview(windowHours = 24) {
  const since = hoursAgo(windowHours);
  const now = new Date();
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);

  const [
    eventsTotal,
    notifTotal,
    signalsTotal,
    positionsTotal,
    eventsDelivery,
    notifDelivery,
    notifPipeline,
    sigDelivery,
    signalStatus,
    serviceHeartbeats,
    stuckNotifs,
    expiredOpenSignals,
    recentErrors,
  ] = await Promise.all([
    db().select({ c: count() }).from(events).where(gte(events.ingestedAt, since)),
    db().select({ c: count() }).from(notifications).where(gte(notifications.ingestedAt, since)),
    db().select({ c: count() }).from(tradingSignals).where(gte(tradingSignals.createdAt, since)),
    db().select({ c: count() }).from(positions).where(gte(positions.openedAt, since)),
    db().select({ k: events.deliveryStatus, c: count() }).from(events).groupBy(events.deliveryStatus),
    db().select({ k: notifications.deliveryStatus, c: count() }).from(notifications).groupBy(notifications.deliveryStatus),
    db().select({ k: notifications.status, c: count() }).from(notifications).groupBy(notifications.status),
    db()
      .select({ k: signalDeliveries.deliveryStatus, c: count() })
      .from(signalDeliveries)
      .groupBy(signalDeliveries.deliveryStatus),
    db()
      .select({ k: tradingSignals.status, c: count() })
      .from(tradingSignals)
      .groupBy(tradingSignals.status),
    db()
      .select({ service: logs.service, last: sql<string>`max(${logs.ts})` })
      .from(logs)
      .groupBy(logs.service),
    db()
      .select({ c: count() })
      .from(notifications)
      .where(and(eq(notifications.status, "processing"), lt(notifications.ingestedAt, stuckBefore))),
    db()
      .select({ c: count() })
      .from(tradingSignals)
      .where(and(eq(tradingSignals.status, "open"), lt(tradingSignals.expiresAt, now))),
    db()
      .select()
      .from(logs)
      .where(inArray(logs.level, ["error", "warn"]))
      .orderBy(desc(logs.ts))
      .limit(20),
  ]);

  const heartbeats = SERVICES.map((service) => {
    const last = serviceHeartbeats.find((h) => h.service === service)?.last ?? null;
    return { service, last, state: heartbeatState(last) };
  });

  return {
    windowHours,
    funnel: {
      events: Number(eventsTotal[0]?.c ?? 0),
      notifications: Number(notifTotal[0]?.c ?? 0),
      signals: Number(signalsTotal[0]?.c ?? 0),
      positions: Number(positionsTotal[0]?.c ?? 0),
    },
    outbox: {
      events: toMap(eventsDelivery),
      notifications: toMap(notifDelivery),
      signals: toMap(sigDelivery),
    },
    pipeline: {
      notifications: toMap(notifPipeline),
    },
    signalStatus: toMap(signalStatus),
    heartbeats,
    stuck: {
      notifications: Number(stuckNotifs[0]?.c ?? 0),
      expiredOpenSignals: Number(expiredOpenSignals[0]?.c ?? 0),
    },
    recentErrors,
  };
}
