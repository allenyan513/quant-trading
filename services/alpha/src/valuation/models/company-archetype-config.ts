// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Company Archetype Configuration
// Static config tables: archetype definitions and terminal growth rates.
// ============================================================

// --- Types ---

export type CompanyArchetype =
  | "high_growth"
  | "profitable_growth"
  | "mature_stable"
  | "dividend_payer"
  | "cyclical"
  | "turnaround"
  | "asset_heavy"
  | "loss_making";

export interface ModelApplicability {
  model_type: string;
  applicable: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  role: "primary" | "cross_check" | "sanity_check" | "not_applicable";
}

// --- Archetype Definitions ---

export const ARCHETYPE_CONFIGS: Record<CompanyArchetype, {
  label: string;
  description: string;
}> = {
  high_growth: {
    label: "High Growth",
    description: "Fast-growing company with strong revenue momentum.",
  },
  profitable_growth: {
    label: "Profitable Growth",
    description: "Company with both strong growth and healthy profitability.",
  },
  mature_stable: {
    label: "Mature & Stable",
    description: "Well-established company with predictable earnings.",
  },
  dividend_payer: {
    label: "Dividend Payer",
    description: "Company returning significant cash to shareholders via dividends.",
  },
  cyclical: {
    label: "Cyclical",
    description: "Earnings fluctuate significantly with economic cycles.",
  },
  turnaround: {
    label: "Turnaround",
    description: "Currently unprofitable but showing improving trends.",
  },
  asset_heavy: {
    label: "Asset-Heavy",
    description: "Capital-intensive business with significant tangible assets.",
  },
  loss_making: {
    label: "Loss-Making",
    description: "Company is currently unprofitable.",
  },
};

// --- Terminal Growth Rate by Archetype ---

const TERMINAL_GROWTH_RATES: Record<CompanyArchetype, number> = {
  high_growth: 0.040,
  profitable_growth: 0.035,
  mature_stable: 0.030,
  dividend_payer: 0.025,
  cyclical: 0.025,
  turnaround: 0.030,
  asset_heavy: 0.025,
  loss_making: 0.030,
};

export function getTerminalGrowthRate(archetype: CompanyArchetype): number {
  return TERMINAL_GROWTH_RATES[archetype];
}