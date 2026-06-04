/**
 * News screening rule pipeline. `runScreen` walks an ordered registry of
 * deterministic hard gates and short-circuits on the first rejection. Adding a
 * rule = add a file under rules/ and one entry here; complex / AND-OR logic
 * lives inside a single rule's `evaluate`. Order matters: cheap rules (no data
 * fetch) come first so they can reject before an expensive profile lookup.
 *
 * Bump SCREENING_VERSION whenever the rule set or a threshold changes — it's
 * stamped onto each screened row (audit, mirrors prompt_version).
 */
import type { ScreenContext, ScreenRule } from "./types.js";
import { requireSymbol } from "./rules/require-symbol.js";
import { minMarketCap } from "./rules/min-market-cap.js";

export { buildScreenContext, type ProfileLoader } from "./context.js";

export const SCREENING_VERSION = "1";

// Ordered cheap → expensive: require_symbol needs nothing; min_market_cap needs
// the fetched profile.
const RULES: ScreenRule[] = [requireSymbol, minMarketCap];

export interface ScreenResult {
  passed: boolean;
  failedRule?: string;
  reason?: string;
  detail?: Record<string, unknown>;
}

export function runScreen(ctx: ScreenContext): ScreenResult {
  for (const rule of RULES) {
    const outcome = rule.evaluate(ctx);
    if (!outcome.ok) {
      return { passed: false, failedRule: rule.id, reason: outcome.reason, detail: outcome.detail };
    }
  }
  return { passed: true };
}

export type { ScreenContext, ScreenRule, ScreenOutcome, NewsRow } from "./types.js";
