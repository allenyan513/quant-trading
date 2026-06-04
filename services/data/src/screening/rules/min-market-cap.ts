/**
 * Liquidity floor: only spend LLM triage on names large enough to trade. Market
 * cap comes from the FMP profile (gathered into the ScreenContext). A missing
 * cap is treated as a rejection (we can't confirm the floor) rather than a pass.
 */
import type { ScreenRule } from "../types.js";

export const MIN_MARKET_CAP = 1_000_000_000; // $1B

export const minMarketCap: ScreenRule = {
  id: "min_market_cap",
  evaluate: (ctx) => {
    const mc = ctx.profile?.marketCap;
    if (typeof mc !== "number" || !Number.isFinite(mc)) {
      return { ok: false, reason: "market_cap_unknown" };
    }
    if (mc < MIN_MARKET_CAP) {
      return { ok: false, reason: "market_cap_below_min", detail: { marketCap: mc, min: MIN_MARKET_CAP } };
    }
    return { ok: true };
  },
};
