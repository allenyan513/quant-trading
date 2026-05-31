// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
import { MODEL_NAMES, MODEL_ORDER } from "./model-names.js";
import { median, round2 } from "./statistics.js";
import type {
  NarrativeFacts,
  NarrativeFactsModel,
  NarrativeFactsPillarSignal,
  ValuationModelType,
  ValuationResult,
  ValuationSummary,
} from "../types.js";

const BULLISH_THRESHOLD = 15;
const BEARISH_THRESHOLD = -15;

const PRIMARY_MODEL_BY_TIER: Record<"full" | "pre_profit", ValuationModelType[]> = {
  full: ["dcf_fcff_growth_5y", "dcf_growth_exit_5y"],
  pre_profit: ["revenue_dcf_10y", "revenue_dcf_5y", "ev_revenue_multiples"],
};

const VERDICT_BASIS_LABELS: Record<ValuationModelType, string> = {
  dcf_fcff_growth_5y: "FCFF Growth Exit 5Y",
  dcf_growth_exit_5y: "FCFF Growth Exit 5Y",
  revenue_dcf_10y: "Revenue DCF 10Y",
  revenue_dcf_5y: "Revenue DCF 5Y",
  ev_revenue_multiples: "EV/Revenue",
  dcf_growth_exit_10y: "DCF Growth Exit 10Y",
  dcf_ebitda_exit_5y: "DCF EBITDA Exit 5Y",
  dcf_ebitda_exit_10y: "DCF EBITDA Exit 10Y",
  dcf_fcff_growth_10y: "FCFF Growth Exit 10Y",
  dcf_fcff_ebitda_exit_5y: "FCFF EBITDA Exit 5Y",
  dcf_fcff_ebitda_exit_10y: "FCFF EBITDA Exit 10Y",
  pe_multiples: "P/E",
  ev_ebitda_multiples: "EV/EBITDA",
  peg: "PEG",
  epv: "Earnings Power Value",
  ddm: "Dividend Discount",
};

function toNarrativeModel(model: ValuationResult): NarrativeFactsModel {
  return {
    model_type: model.model_type,
    label: MODEL_NAMES[model.model_type] ?? model.model_type,
    fair_value: round2(model.fair_value),
    upside_percent: round2(model.upside_percent),
  };
}

function isPreProfit(summary: ValuationSummary): boolean {
  return summary.models.some(
    (model) => model.model_type === "revenue_dcf_5y" || model.model_type === "revenue_dcf_10y"
  );
}

function sortModels(models: ValuationResult[]): ValuationResult[] {
  return [...models].sort((a, b) => {
    const ai = MODEL_ORDER.indexOf(a.model_type);
    const bi = MODEL_ORDER.indexOf(b.model_type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function findPrimaryModel(
  models: ValuationResult[],
  valuationTier: "full" | "pre_profit",
  summary: ValuationSummary
): ValuationResult | null {
  const preferredTypes = PRIMARY_MODEL_BY_TIER[valuationTier];
  for (const type of preferredTypes) {
    const match = models.find((model) => model.model_type === type);
    if (match) return match;
  }

  const exactFairValue = models.find((model) => Math.abs(model.fair_value - summary.primary_fair_value) < 0.01);
  return exactFairValue ?? models[0] ?? null;
}

function computePricePosition(currentPrice: number, low: number, high: number): NarrativeFacts["price_position"] {
  if (currentPrice < low) return "below_range";
  if (currentPrice > high) return "above_range";
  if (high <= low) return "mid_range";

  const position = (currentPrice - low) / (high - low);
  if (position < 1 / 3) return "lower_band";
  if (position > 2 / 3) return "upper_band";
  return "mid_range";
}

function computePillarDirection(upsideValues: number[]): NarrativeFactsPillarSignal["direction"] {
  if (upsideValues.length === 0) return "neutral";

  const bullishCount = upsideValues.filter((value) => value > BULLISH_THRESHOLD).length;
  const bearishCount = upsideValues.filter((value) => value < BEARISH_THRESHOLD).length;

  if (bullishCount > 0 && bearishCount > 0) return "mixed";

  const mid = median(upsideValues);
  if (mid > BULLISH_THRESHOLD) return "bullish";
  if (mid < BEARISH_THRESHOLD) return "bearish";
  return "neutral";
}

function buildPillarSignals(summary: ValuationSummary): NarrativeFactsPillarSignal[] {
  const pillarKeys: NarrativeFactsPillarSignal["pillar"][] = [
    "dcf",
    "tradingMultiples",
    "revenueMultiples",
    "peg",
    "epv",
    "ddm",
  ];

  return pillarKeys.map((pillar) => {
    const models = summary.pillars[pillar].models.filter((model) => model.fair_value > 0);
    const upsideValues = models.map((model) => model.upside_percent);
    return {
      pillar,
      direction: computePillarDirection(upsideValues),
      median_upside: upsideValues.length > 0 ? round2(median(upsideValues)) : null,
      model_count: models.length,
    };
  }).filter((signal) => signal.model_count > 0);
}

function buildKeyDrivers(
  valuationTier: "full" | "pre_profit",
  primaryModel: ValuationResult | null,
  summary: ValuationSummary
): string[] {
  const drivers: string[] = [];

  if (valuationTier === "pre_profit") {
    drivers.push("future revenue scale");
    drivers.push("margin convergence toward mature peers");
  } else {
    drivers.push("forward cash-flow growth");
    drivers.push("terminal value assumptions");
  }

  if (summary.wacc?.wacc > 0) {
    drivers.push("discount rate sensitivity");
  }

  if (summary.models.some((model) => model.model_type === "ev_ebitda_multiples")) {
    drivers.push("peer multiple normalization");
  }

  return [...new Set(drivers)].slice(0, 4);
}

function buildRiskFlags(
  valuationTier: "full" | "pre_profit",
  spreadPctOfMedian: number | null,
  summary: ValuationSummary
): string[] {
  const flags: string[] = [];

  if (spreadPctOfMedian !== null && spreadPctOfMedian >= 60) {
    flags.push("wide model dispersion");
  }
  if (valuationTier === "pre_profit") {
    flags.push("profitability is still forecast-dependent");
  }
  if (summary.models.some((model) => model.model_type === "epv" && model.fair_value > 0)) {
    flags.push("current earnings power may lag growth expectations");
  }
  if (summary.models.some((model) => model.model_type === "ddm" && model.fair_value > 0)) {
    flags.push("income support matters for downside framing");
  }

  return [...new Set(flags)].slice(0, 4);
}

function buildKeyTensions(
  bullishModel: ValuationResult | null,
  bearishModel: ValuationResult | null,
  spreadPctOfMedian: number | null,
  valuationTier: "full" | "pre_profit"
): string[] {
  const tensions: string[] = [];

  if (bullishModel && bearishModel && bullishModel.model_type !== bearishModel.model_type) {
    tensions.push(
      `${MODEL_NAMES[bullishModel.model_type] ?? bullishModel.model_type} is more optimistic than ${MODEL_NAMES[bearishModel.model_type] ?? bearishModel.model_type}`
    );
  }
  if (spreadPctOfMedian !== null && spreadPctOfMedian >= 60) {
    tensions.push("valuation outcomes are highly sensitive to long-term assumptions");
  } else if (spreadPctOfMedian !== null && spreadPctOfMedian >= 30) {
    tensions.push("models point to a meaningful but not extreme valuation debate");
  }
  if (valuationTier === "pre_profit") {
    tensions.push("the debate is mainly about scaling revenue into durable margins");
  }

  return tensions.slice(0, 3);
}

export function buildNarrativeFacts(summary: ValuationSummary): NarrativeFacts {
  const valuationTier = isPreProfit(summary) ? "pre_profit" : "full";
  const validModels = sortModels(summary.models.filter((model) => model.fair_value > 0));
  const fairValues = validModels.map((model) => model.fair_value);
  const lowFairValue = fairValues.length > 0 ? Math.min(...fairValues) : null;
  const highFairValue = fairValues.length > 0 ? Math.max(...fairValues) : null;
  const medianFairValue = fairValues.length > 0 ? median(fairValues) : null;
  const spreadPctOfMedian =
    medianFairValue && lowFairValue !== null && highFairValue !== null
      ? round2(((highFairValue - lowFairValue) / medianFairValue) * 100)
      : null;

  const primaryModel = findPrimaryModel(validModels, valuationTier, summary);
  const bullishModel = validModels.reduce<ValuationResult | null>(
    (max, model) => (!max || model.fair_value > max.fair_value ? model : max),
    null
  );
  const bearishModel = validModels.reduce<ValuationResult | null>(
    (min, model) => (!min || model.fair_value < min.fair_value ? model : min),
    null
  );

  return {
    ticker: summary.ticker,
    company_name: summary.company_name,
    current_price: round2(summary.current_price),
    valuation_tier: valuationTier,
    verdict: summary.verdict,
    verdict_basis: primaryModel
      ? (VERDICT_BASIS_LABELS[primaryModel.model_type] ?? MODEL_NAMES[primaryModel.model_type] ?? primaryModel.model_type)
      : "valuation summary",
    classification_label: summary.classification.label,
    model_count: validModels.length,
    applicable_models: validModels.map(toNarrativeModel),
    primary_model: primaryModel ? toNarrativeModel(primaryModel) : null,
    bullish_model: bullishModel ? toNarrativeModel(bullishModel) : null,
    bearish_model: bearishModel ? toNarrativeModel(bearishModel) : null,
    median_fair_value: medianFairValue !== null ? round2(medianFairValue) : null,
    low_fair_value: lowFairValue !== null ? round2(lowFairValue) : null,
    high_fair_value: highFairValue !== null ? round2(highFairValue) : null,
    spread_pct_of_median: spreadPctOfMedian,
    price_position:
      lowFairValue !== null && highFairValue !== null
        ? computePricePosition(summary.current_price, lowFairValue, highFairValue)
        : "mid_range",
    pillar_signals: buildPillarSignals(summary),
    key_tensions: buildKeyTensions(bullishModel, bearishModel, spreadPctOfMedian, valuationTier),
    key_drivers: buildKeyDrivers(valuationTier, primaryModel, summary),
    risk_flags: buildRiskFlags(valuationTier, spreadPctOfMedian, summary),
  };
}