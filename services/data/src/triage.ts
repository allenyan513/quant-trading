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
import { db, dbSchema, mapLimit, marketdata } from "@qt/shared";
import { buildScreenContext, runScreen, SCREENING_VERSION, type ProfileLoader } from "./screening/index.js";
import { runTriageAgent } from "./agent.js";
import { log } from "./log.js";

const { newsItems } = dbSchema;

// Bounded concurrency: each item is an LLM loop + several FMP calls, so a serial
// run risks a cron-tick timeout on a big batch; unbounded would hammer FMP/LLM
// rate limits. fmpGet throttles globally underneath, so a small fan-out is safe.
const TRIAGE_CONCURRENCY = 4;

type ItemOutcome = "triaged" | "screenedOut" | "failed";

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
 * Screen + triage staged news. With no `ids`, processes untriaged `new` rows; an
 * explicit empty `ids` array is a no-op (never a full-queue sweep — that would be
 * an accidental, expensive LLM run). Bounded concurrency keeps a large batch under
 * the cron timeout; the per-symbol profile fetch is memoized so a symbol with
 * several items hits FMP once.
 */
export async function triageNewsItems(ids?: string[]): Promise<TriageRunResult> {
  // An explicit `[]` means "these specific rows" = none. Guard before the
  // falsy-length fallthrough so a buggy caller can't trigger a triage-all.
  if (ids && ids.length === 0) return { considered: 0, triaged: 0, screenedOut: 0, failed: 0 };

  const rows = ids?.length
    ? await db().select().from(newsItems).where(inArray(newsItems.id, ids))
    : await db()
        .select()
        .from(newsItems)
        .where(and(eq(newsItems.status, "new"), isNull(newsItems.triagedAt)));

  // Memoize profile lookups within the run (getProfile is a pass-through FMP
  // call). A failed lookup is cached as null and degrades gracefully — the
  // min_market_cap rule rejects "unknown" cap — instead of failing+retrying the
  // item forever.
  const profileCache = new Map<string, Record<string, unknown> | null>();
  const loadProfile: ProfileLoader = async (symbol) => {
    if (profileCache.has(symbol)) return profileCache.get(symbol)!;
    let p: Record<string, unknown> | null = null;
    try {
      p = await marketdata.getProfile(symbol);
    } catch (err) {
      log.warn("news.triage.profile_failed", { symbol, error: err instanceof Error ? err.message : String(err) });
    }
    profileCache.set(symbol, p);
    return p;
  };

  const now = new Date();

  async function processRow(row: typeof rows[number]): Promise<ItemOutcome> {
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
        return "screenedOut";
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
      return "triaged";
    } catch (err) {
      log.warn("news.triage.item_failed", {
        id: row.id,
        symbol: row.symbol,
        error: err instanceof Error ? err.message : String(err),
      });
      return "failed";
    }
  }

  const outcomes = await mapLimit(rows, TRIAGE_CONCURRENCY, processRow);
  const result: TriageRunResult = {
    considered: rows.length,
    triaged: outcomes.filter((o) => o === "triaged").length,
    screenedOut: outcomes.filter((o) => o === "screenedOut").length,
    failed: outcomes.filter((o) => o === "failed").length,
  };

  log.info("news.triage.done", { ...result });
  return result;
}
