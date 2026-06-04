/**
 * News triage orchestration (issue #59).
 *
 * Drives staged news rows through two layers: a deterministic screen (the rule
 * pipeline — cheap hard gates like market cap) and, for survivors, the LLM
 * triage agent (materiality + priority, plus cache warming via its read tools).
 * Results are written back onto `data_news_items` so the dashboard can surface
 * the agent's suggestions and a human can act on them.
 *
 * Idempotent: by default it triages only untriaged `new` rows; pass explicit
 * `ids` to (re)triage specific rows.
 */
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db, dbSchema, marketdata } from "@qt/shared";
import { buildScreenContext, runScreen, SCREENING_VERSION, type ProfileLoader } from "./screening/index.js";
import { runTriageAgent } from "./agent.js";
import { log } from "./log.js";

const { newsItems } = dbSchema;

export interface TriageRunResult {
  /** Rows considered this run. */
  considered: number;
  /** Rows that passed the screen and got an LLM verdict. */
  triaged: number;
  /** Rows rejected by the deterministic screen (no LLM spend). */
  screenedOut: number;
  /** Rows whose agent run errored (left for a retry). */
  failed: number;
}

/**
 * Screen + triage staged news. With no `ids`, processes untriaged `new` rows.
 * Processed sequentially to stay gentle on FMP / LLM rate limits; the per-symbol
 * profile fetch is memoized so a symbol with several items hits FMP once.
 */
export async function triageNewsItems(ids?: string[]): Promise<TriageRunResult> {
  const rows = ids?.length
    ? await db().select().from(newsItems).where(inArray(newsItems.id, ids))
    : await db()
        .select()
        .from(newsItems)
        .where(and(eq(newsItems.status, "new"), isNull(newsItems.triagedAt)));

  // Memoize profile lookups within the run (getProfile is a pass-through FMP call).
  const profileCache = new Map<string, Record<string, unknown> | null>();
  const loadProfile: ProfileLoader = async (symbol) => {
    if (profileCache.has(symbol)) return profileCache.get(symbol)!;
    const p = await marketdata.getProfile(symbol);
    profileCache.set(symbol, p);
    return p;
  };

  const result: TriageRunResult = { considered: rows.length, triaged: 0, screenedOut: 0, failed: 0 };
  const now = new Date();

  for (const row of rows) {
    try {
      const ctx = await buildScreenContext(row, loadProfile);
      const screen = runScreen(ctx);

      if (!screen.passed) {
        await db()
          .update(newsItems)
          .set({
            screenPassed: false,
            screenFailedRule: screen.failedRule ?? null,
            screenDetail: { reason: screen.reason ?? null, ...(screen.detail ?? {}) },
            screeningVersion: SCREENING_VERSION,
            triagedAt: now,
          })
          .where(eq(newsItems.id, row.id));
        result.screenedOut++;
        continue;
      }

      const verdict = await runTriageAgent({
        symbol: ctx.symbol!, // require_symbol guarantees non-null past the screen
        category: row.category,
        title: row.title,
        text: row.text,
        sector: typeof ctx.profile?.sector === "string" ? ctx.profile.sector : null,
      });

      await db()
        .update(newsItems)
        .set({
          screenPassed: true,
          screenFailedRule: null,
          screenDetail: null,
          screeningVersion: SCREENING_VERSION,
          triageSymbol: verdict.symbol,
          triageMaterial: verdict.material,
          triagePriority: verdict.priority,
          triageRationale: verdict.rationale,
          triageModel: verdict.model,
          triagePromptVersion: verdict.promptVersion,
          triagedAt: now,
        })
        .where(eq(newsItems.id, row.id));
      result.triaged++;
    } catch (err) {
      log.warn("news.triage.item_failed", {
        id: row.id,
        symbol: row.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
    }
  }

  log.info("news.triage.done", { ...result });
  return result;
}
