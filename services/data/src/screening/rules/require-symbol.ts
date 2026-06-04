/**
 * Cheapest gate (no data fetch): alpha is symbol-centric, so a news row with no
 * resolvable ticker can't be priced. Reject it before any profile lookup.
 */
import type { ScreenRule } from "../types.js";

export const requireSymbol: ScreenRule = {
  id: "require_symbol",
  evaluate: (ctx) =>
    ctx.symbol ? { ok: true } : { ok: false, reason: "no_symbol" },
};
