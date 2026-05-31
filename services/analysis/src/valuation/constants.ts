/* Valuation constants ported from legends/value-scope/src/lib/constants.ts. */
export const VERDICT_THRESHOLD = 15;   // % upside band for under/over-valued
export const MIN_GROWTH_RATE = -0.1;
export const MAX_GROWTH_RATE = 0.3;

/**
 * Minimum spread between the discount rate and the terminal growth rate before a
 * Gordon-Growth perpetuity (`cf / (r - g)`) is numerically safe. When `r` and `g`
 * are too close the perpetuity blows up (e.g. a 1000× multiple), so models fall
 * back to an exit multiple (or return N/A for DDM) instead.
 */
export const MIN_DISCOUNT_TERMINAL_SPREAD = 0.015;
/** Exit multiple applied to terminal cash flow when the spread is below the minimum. */
export const TERMINAL_EXIT_MULTIPLE = 20;
