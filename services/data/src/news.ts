/**
 * Manual news flow (issue #59) — persistence + alpha hand-off.
 *
 * `stageNews` lands normalized market-wide news into `news_items` (staging only,
 * dedup on (category, external_id) — NEVER the live `events` table). `notifyNews`
 * is the human "push to alpha" action: it turns selected staged rows into
 * `EventPayload`s and reuses the normal `ingestAndNotifyAll`, which groups by
 * (symbol, event_type) and delivers one notification per symbol with the existing
 * outbox + idempotency. Articles with no resolvable symbol are skipped (alpha is
 * symbol-centric); the caller can supply a manual override per id.
 */
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, dbSchema, type EventPayload } from "@qt/shared";
import { ingestAndNotifyAll } from "./deliver.js";
import type { NewsItemRow } from "./pull/news-feed.js";
import { log } from "./log.js";

const { newsItems } = dbSchema;

export interface StageResult {
  pulled: number;
  inserted: number;
}

/** Upsert staged news rows (idempotent on category+external_id). Returns counts. */
export async function stageNews(items: NewsItemRow[], batchSize = 50): Promise<StageResult> {
  if (items.length === 0) return { pulled: 0, inserted: 0 };
  let inserted = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const rows = await db()
      .insert(newsItems)
      .values(
        chunk.map((it) => ({
          id: randomUUID(),
          category: it.category,
          externalId: it.external_id,
          symbol: it.symbol,
          title: it.title,
          text: it.text,
          url: it.url,
          site: it.site,
          image: it.image,
          publishedAt: it.published_at ? new Date(it.published_at) : null,
          raw: it.raw,
        })),
      )
      .onConflictDoNothing({ target: [newsItems.category, newsItems.externalId] })
      .returning({ id: newsItems.id });
    inserted += rows.length;
  }
  return { pulled: items.length, inserted };
}

export interface NotifyResult {
  /** Staged rows materialized into events + handed to alpha. */
  notified: number;
  /** Rows skipped for lack of a resolvable symbol (or url). */
  skipped: number;
  /** Events carried to alpha in a delivered notification. */
  delivered: number;
  /** Notifications sent (one per distinct symbol). */
  notifications: number;
}

/**
 * Push selected staged news rows to alpha. Each row's symbol comes from the
 * article (overridable per id); rows without one are skipped. Selected rows
 * become `news` events and are delivered via the shared aggregating outbox, so a
 * multi-symbol selection fans out to one notification per symbol automatically.
 */
export async function notifyNews(
  ids: string[],
  symbolOverride: Record<string, string> = {},
): Promise<NotifyResult> {
  if (ids.length === 0) return { notified: 0, skipped: 0, delivered: 0, notifications: 0 };

  const rows = await db().select().from(newsItems).where(inArray(newsItems.id, ids));
  const payloads: EventPayload[] = [];
  const usedIds: string[] = [];
  let skipped = 0;

  for (const r of rows) {
    const symbol = (symbolOverride[r.id] ?? r.symbol ?? "").trim().toUpperCase();
    if (!symbol || !r.url) {
      skipped++;
      continue;
    }
    payloads.push({
      source: "fmp",
      external_id: `news:${symbol}:${r.url}`,
      symbol,
      event_type: "news",
      direction_hint: null,
      headline: r.title,
      observed_at: r.publishedAt ? r.publishedAt.toISOString() : null,
      raw: (r.raw as Record<string, unknown>) ?? {},
    });
    usedIds.push(r.id);
  }

  const res = payloads.length
    ? await ingestAndNotifyAll(payloads)
    : { delivered: 0, skipped: 0, notifications: 0 };

  if (usedIds.length > 0) {
    await db().update(newsItems).set({ status: "notified" }).where(inArray(newsItems.id, usedIds));
  }

  log.info("news.notify", {
    requested: ids.length,
    notified: usedIds.length,
    skipped,
    notifications: res.notifications,
  });
  return { notified: usedIds.length, skipped, delivered: res.delivered, notifications: res.notifications };
}
