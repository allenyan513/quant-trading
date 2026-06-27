/**
 * Shared valuation constants. Single source of truth so the engine (services/data)
 * and the dashboard (services/spa) agree on the verdict band. Engine-only constants
 * (growth clamps, terminal spreads) stay in services/data/src/valuation/constants.ts.
 *
 * Ported from legends/value-scope/src/lib/constants.ts.
 */

/** Upside %/downside % band that splits undervalued / fairly_valued / overvalued. */
export const VERDICT_THRESHOLD = 15;
