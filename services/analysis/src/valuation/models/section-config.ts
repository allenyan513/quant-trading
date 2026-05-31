// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// Section registry for the unified valuation page.
// Drives both page rendering (which sections to show) and TOC sidebar.
// Adding a new tier (e.g., "pre_revenue") = add entries to the type union + tiers arrays.

import type { ValuationTier } from "../types.js";

export interface ValuationSection {
  id: string;
  label: string;
  tiers: ValuationTier[];
}

export const VALUATION_SECTIONS: ValuationSection[] = [
  { id: "summary", label: "Summary", tiers: ["full", "pre_profit"] },
  { id: "valuation-chart", label: "Valuation History", tiers: ["full", "pre_profit"] },
  { id: "dcf", label: "DCF Analysis", tiers: ["full", "pre_profit"] },
  { id: "trading-multiples", label: "Trading Multiples", tiers: ["full", "pre_profit"] },
  { id: "peg", label: "PEG Fair Value", tiers: ["full"] },
  { id: "epv", label: "Earnings Power Value", tiers: ["full"] },
  { id: "ddm", label: "Dividend Discount", tiers: ["full", "pre_profit"] },
];

/** Filter sections visible for a given tier */
export function getSectionsForTier(tier: ValuationTier): ValuationSection[] {
  return VALUATION_SECTIONS.filter((s) => s.tiers.includes(tier));
}