/**
 * Display-side constants for the valuation detail page (ported from value-scope).
 * Kept minimal — only what the ported UI references.
 */

// VERDICT_THRESHOLD is shared with the engine — single source of truth.
export { VERDICT_THRESHOLD } from "@qt/shared/valuation-constants";

/** AI narrative is a value-scope-only feature; off in this project. */
export const ENABLE_AI_NARRATIVE = false;

/** Max width (px) for a peer name cell on mobile in the peer table. */
export const PEER_NAME_MOBILE_MAX_W = 140;
