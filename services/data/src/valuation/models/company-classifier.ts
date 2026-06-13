// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Company Classifier — Determines company archetype and model applicability
// ============================================================

import type { FinancialStatement, Company, AnalystEstimate } from "../types.js";
import { formatRatio } from "../format.js";
import {
  type CompanyArchetype,
  type ModelApplicability,
  ARCHETYPE_CONFIGS,
} from "./company-archetype-config.js";
import { type ClassificationMetrics, computeClassificationMetrics } from "./company-metrics.js";

// Re-export types and helpers for backward compatibility
export type { CompanyArchetype, ModelApplicability };
export { getTerminalGrowthRate } from "./company-archetype-config.js";

// --- Classification Logic ---

function determineArchetype(m: ClassificationMetrics): CompanyArchetype {
  if (!m.isCurrentlyProfitable && !m.isProfitImproving) return "loss_making";
  if (!m.isCurrentlyProfitable && m.isProfitImproving) return "turnaround";

  const effectiveGrowth = m.analystGrowth ?? m.revenueCAGR;
  // high_growth requires growth to still be happening: a 5y endpoint CAGR can read
  // ">20%" long after a former hyper-grower has plateaued (e.g. TSLA — ~25% 5y CAGR
  // but ~flat the last 3 years). Confirm with the recent trajectory so a decelerated
  // name falls through to cyclical / mature instead.
  if (effectiveGrowth > 0.20 && m.recentRevenueGrowth > 0.10 && m.latestNetMargin < 0.10) return "high_growth";

  if (effectiveGrowth > 0.12 && m.latestNetMargin > 0.05) return "profitable_growth";
  if (effectiveGrowth > 0.08 && m.latestNetMargin > 0.20) return "profitable_growth";

  if (m.earningsVolatility > 1.5 || m.revenueVolatility > 1.0) return "cyclical";
  if (m.dividendYield > 0.02) return "dividend_payer";
  if (m.assetIntensity > 3) return "asset_heavy";
  if (effectiveGrowth <= 0.12 && m.isCurrentlyProfitable) return "mature_stable";

  return "mature_stable";
}

function buildTraits(m: ClassificationMetrics): string[] {
  const traits: string[] = [];

  // Describe the *current* trajectory (recent ≈2y), not the 5y endpoint CAGR which
  // can stay high after growth has stalled.
  const g = m.recentRevenueGrowth;
  if (g > 0.20) traits.push("High revenue growth (~" + (g * 100).toFixed(0) + "% recent)");
  else if (g > 0.10) traits.push("Moderate growth (~" + (g * 100).toFixed(0) + "% recent)");
  else if (g > 0) traits.push("Low/slowing growth (~" + (g * 100).toFixed(0) + "% recent)");
  else traits.push("Revenue declining (~" + (g * 100).toFixed(0) + "% recent)");
  // Flag former hyper-growers that have decelerated.
  if (m.revenueCAGR > 0.20 && g < 0.10) traits.push("Decelerated from ~" + (m.revenueCAGR * 100).toFixed(0) + "% 5y CAGR");

  if (m.latestNetMargin > 0.20) traits.push("High profitability (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0.05) traits.push("Moderate margins (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0) traits.push("Thin margins (" + formatRatio(m.latestNetMargin) + " net margin)");
  else traits.push("Currently unprofitable");

  if (m.dividendYield > 0.03) traits.push("Strong dividend yield (" + formatRatio(m.dividendYield) + ")");
  else if (m.dividendYield > 0.01) traits.push("Pays dividends (" + formatRatio(m.dividendYield) + " yield)");

  if (m.earningsVolatility > 1.5) traits.push("Highly cyclical earnings");
  else if (m.earningsVolatility > 0.8) traits.push("Moderately volatile earnings");

  if (m.debtToEquity > 2) traits.push("High leverage (D/E " + m.debtToEquity.toFixed(1) + "x)");

  if (m.fcfYield > 0.05) traits.push("Strong FCF yield (" + formatRatio(m.fcfYield) + ")");
  else if (m.fcfYield < 0) traits.push("Negative free cash flow");

  return traits;
}

function buildModelApplicability(
  archetype: CompanyArchetype,
  m: ClassificationMetrics
): ModelApplicability[] {
  const applicability: ModelApplicability[] = [];

  const dcfConfidence: "high" | "medium" | "low" =
    archetype === "loss_making" || archetype === "turnaround" ? "low"
    : archetype === "high_growth" ? "medium"
    : "high";
  const dcfReason =
    dcfConfidence === "low" ? "DCF projects future cash flows; use with caution for unprofitable companies"
    : dcfConfidence === "medium" ? "DCF captures intrinsic value based on projected free cash flows"
    : "Predictable cash flows make DCF the most reliable intrinsic valuation";

  for (const dcfType of ["dcf_fcff_growth_5y", "dcf_fcff_growth_10y", "dcf_fcff_ebitda_exit_5y", "dcf_fcff_ebitda_exit_10y"]) {
    applicability.push({
      model_type: dcfType,
      applicable: true,
      reason: dcfReason,
      confidence: dcfConfidence,
      role: "primary",
    });
  }

  if (!m.isCurrentlyProfitable || m.latestEPS <= 0) {
    applicability.push({
      model_type: "pe_multiples",
      applicable: false,
      reason: "Negative or zero EPS makes P/E valuation meaningless",
      confidence: "high",
      role: "not_applicable",
    });
  } else if (archetype === "cyclical") {
    applicability.push({
      model_type: "pe_multiples",
      applicable: true,
      reason: "Current P/E may be distorted by cycle position; interpret carefully",
      confidence: "low",
      role: "sanity_check",
    });
  } else {
    applicability.push({
      model_type: "pe_multiples",
      applicable: true,
      reason: "Peer-based P/E provides useful market-relative valuation",
      confidence: "high",
      role: archetype === "mature_stable" ? "primary" : "cross_check",
    });
  }

  if (archetype === "loss_making" && m.latestEPS <= 0) {
    applicability.push({
      model_type: "ev_ebitda_multiples",
      applicable: true,
      reason: "EV/EBITDA provides a useful anchor when earnings are negative",
      confidence: "medium",
      role: "primary",
    });
  } else {
    applicability.push({
      model_type: "ev_ebitda_multiples",
      applicable: true,
      reason: "EV/EBITDA provides enterprise-level valuation relative to peers",
      confidence: "high",
      role: "cross_check",
    });
  }

  // Revenue DCF — primary for pre-profit, supplementary for others
  if (!m.isCurrentlyProfitable) {
    applicability.push({
      model_type: "revenue_dcf_5y",
      applicable: true,
      reason: "Revenue DCF with margin convergence is the primary model for pre-profit companies",
      confidence: "medium",
      role: "primary",
    });
  } else {
    applicability.push({
      model_type: "revenue_dcf_5y",
      applicable: false,
      reason: "Company is profitable — standard FCFF DCF is preferred",
      confidence: "high",
      role: "not_applicable",
    });
  }

  // EV/Revenue — useful for all companies, especially pre-profit
  applicability.push({
    model_type: "ev_revenue_multiples",
    applicable: true,
    reason: !m.isCurrentlyProfitable
      ? "EV/Revenue provides peer-relative valuation when earnings-based multiples are unavailable"
      : "EV/Revenue provides a revenue-based cross-check",
    confidence: !m.isCurrentlyProfitable ? "medium" : "low",
    role: !m.isCurrentlyProfitable ? "cross_check" : "sanity_check",
  });

  if (m.latestEPS <= 0) {
    applicability.push({
      model_type: "peg",
      applicable: false,
      reason: "Requires positive EPS and meaningful earnings growth",
      confidence: "high",
      role: "not_applicable",
    });
  } else if (archetype === "mature_stable" && m.revenueCAGR < 0.05) {
    applicability.push({
      model_type: "peg",
      applicable: true,
      reason: "Low growth company results in conservative PEG valuation",
      confidence: "low",
      role: "sanity_check",
    });
  } else {
    applicability.push({
      model_type: "peg",
      applicable: true,
      reason: "PEG-based approach provides a quick growth-adjusted sanity check",
      confidence: "medium",
      role: "sanity_check",
    });
  }

  return applicability;
}

// --- Public API ---

export function classifyCompany(
  company: Company,
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[]
) {
  const metrics = computeClassificationMetrics(company, historicals, estimates);
  const archetype = determineArchetype(metrics);
  const config = ARCHETYPE_CONFIGS[archetype];
  const traits = buildTraits(metrics);
  const modelApplicability = buildModelApplicability(archetype, metrics);

  return {
    archetype,
    label: config.label,
    description: config.description,
    traits,
    model_applicability: modelApplicability,
  };
}