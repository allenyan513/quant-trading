/**
 * Valuation domain types. Single source of truth now lives in @qt/shared so the
 * producer (this engine) and the consumer (services/spa) can't drift. Re-exported
 * here so the engine's internal `./types.js` / `../types.js` imports keep working.
 */
export * from "@qt/shared/valuation-types";
