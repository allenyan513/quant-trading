/**
 * Deterministic news screening — types for the rule pipeline.
 *
 * Each hard gate (market cap, category, …) is a named, independently-testable
 * `ScreenRule`. The registry (index.ts) runs them in order and short-circuits on
 * the first rejection, so cheap rules (no data fetch) can gate before expensive
 * ones. Fuzzy "is this material / how urgent" judgement is NOT here — that's the
 * LLM triage agent's job. This layer is objective, cheap, and auditable.
 */
import type { dbSchema } from "@qt/shared";

export type NewsRow = typeof dbSchema.newsItems.$inferSelect;

/** Facts a rule may inspect, gathered once per news row and shared across rules. */
export interface ScreenContext {
  news: NewsRow;
  /** Resolved ticker (from the article), uppercased; null if the row has none. */
  symbol: string | null;
  /** FMP company profile (marketCap / sector / exchange / price …), or null. */
  profile: Record<string, unknown> | null;
}

export type ScreenOutcome =
  | { ok: true }
  | { ok: false; reason: string; detail?: Record<string, unknown> };

export interface ScreenRule {
  /** Stable id — recorded as `screen_failed_rule` when this rule rejects. */
  id: string;
  evaluate(ctx: ScreenContext): ScreenOutcome;
}
