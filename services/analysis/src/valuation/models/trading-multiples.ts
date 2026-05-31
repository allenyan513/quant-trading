// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// Trading Multiples Valuation (P/E, EV/EBITDA)
// Peer-based: Industry median × company metric = fair value
// Each multiple has trailing + forward legs; selected = average
// ============================================================

import type {
  ValuationResult,
  ValuationModelType,
  PeerComparison,
  FinancialStatement,
  Company,
} from "../types.js";
import { median, percentiles, round2 } from "./statistics.js";

// --- Public types ---

export interface TradingMultiplesInputs {
  financials: FinancialStatement;
  company: Company;
  currentPrice: number;
  peers: PeerComparison[];
  /** Forward net income = analyst EPS estimate × shares */
  forwardNetIncome?: number;
  /** Forward EBITDA = analyst revenue estimate × trailing EBITDA margin */
  forwardEBITDA?: number;
  /** Forward revenue = analyst revenue estimate (for EV/Revenue multiples) */
  forwardRevenue?: number;
}

/** One leg of a multiple valuation (trailing or forward) */
export interface MultipleLeg {
  type: "trailing" | "forward";
  industryMedian: number;
  companyMetric: number;
  metricLabel: string;
  fairPrice: number;
  /** For EV-based: intermediate values */
  enterpriseValue?: number;
  equityValue?: number;
}

/** Detailed result with trailing/forward breakdown */
export interface TradingMultiplesDetailedResult {
  result: ValuationResult;
  trailing: MultipleLeg | null;
  forward: MultipleLeg | null;
  peerRange: { p25: number; p75: number };
  peerCount: number;
}

// --- Helpers ---

function naResult(modelType: ValuationModelType, note: string): ValuationResult {
  return {
    model_type: modelType,
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}

function extractValidMultiples(
  peers: PeerComparison[],
  extractor: (p: PeerComparison) => number | null,
  cap: number,
): { validPeers: PeerComparison[]; values: number[] } {
  const validPeers = peers.filter((p) => {
    const v = extractor(p);
    return v !== null && v > 0 && v < cap;
  });
  const values = validPeers.map((p) => extractor(p)!);
  return { validPeers, values };
}

// --- P/E Multiples ---

/**
 * P/E Multiples Valuation (peer-based, trailing + forward)
 *
 * Trailing leg: Industry median trailing P/E × company TTM net income ÷ shares
 * Forward leg:  Industry median forward P/E × company forward net income ÷ shares
 * Selected = average of available legs
 */
export function calculatePEMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const result = calculatePEMultiplesDetailed(inputs);
  return result.result;
}

export function calculatePEMultiplesDetailed(inputs: TradingMultiplesInputs): TradingMultiplesDetailedResult {
  const { financials, company, currentPrice, peers, forwardNetIncome } = inputs;

  const netIncome = financials.net_income;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!netIncome || netIncome <= 0 || !sharesOutstanding) {
    return {
      result: naResult("pe_multiples", "N/A — Negative or zero net income"),
      trailing: null,
      forward: null,
      peerRange: { p25: 0, p75: 0 },
      peerCount: 0,
    };
  }

  // Trailing P/E peers
  const { validPeers: trailingPeers, values: trailingValues } =
    extractValidMultiples(peers, (p) => p.trailing_pe, 200);
  const trailingMedian = trailingValues.length > 0 ? median(trailingValues) : null;
  const { p25, p75 } = percentiles(trailingValues, trailingMedian ?? 20);

  // Forward P/E peers
  const { values: forwardValues } =
    extractValidMultiples(peers, (p) => p.forward_pe, 200);
  const forwardMedian = forwardValues.length > 0 ? median(forwardValues) : null;

  // Build legs
  let trailingLeg: MultipleLeg | null = null;
  if (trailingMedian !== null) {
    const equityValue = trailingMedian * netIncome;
    trailingLeg = {
      type: "trailing",
      industryMedian: trailingMedian,
      companyMetric: netIncome,
      metricLabel: "Net Income (TTM)",
      fairPrice: equityValue / sharesOutstanding,
    };
  }

  let forwardLeg: MultipleLeg | null = null;
  if (forwardMedian !== null && forwardNetIncome && forwardNetIncome > 0) {
    const equityValue = forwardMedian * forwardNetIncome;
    forwardLeg = {
      type: "forward",
      industryMedian: forwardMedian,
      companyMetric: forwardNetIncome,
      metricLabel: "Net Income (Forward)",
      fairPrice: equityValue / sharesOutstanding,
    };
  }

  // Selected = average of available legs
  const legs = [trailingLeg, forwardLeg].filter((l): l is MultipleLeg => l !== null);
  if (legs.length === 0) {
    return {
      result: naResult("pe_multiples", "N/A — Insufficient peer P/E data"),
      trailing: null,
      forward: null,
      peerRange: { p25: 0, p75: 0 },
      peerCount: 0,
    };
  }

  const fairValue = Math.max(0, legs.reduce((sum, l) => sum + l.fairPrice, 0) / legs.length);
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Low/high from trailing p25/p75
  const lowFairPrice = Math.max(0, p25 * netIncome / sharesOutstanding);
  const highFairPrice = Math.max(0, p75 * netIncome / sharesOutstanding);

  const result: ValuationResult = {
    model_type: "pe_multiples",
    fair_value: round2(fairValue),
    upside_percent: round2(upside),
    low_estimate: round2(lowFairPrice),
    high_estimate: round2(highFairPrice),
    assumptions: {
      method: "peer_comparison",
      trailing_median: trailingMedian !== null ? round2(trailingMedian) : null,
      forward_median: forwardMedian !== null ? round2(forwardMedian) : null,
      trailing_net_income: round2(netIncome),
      forward_net_income: forwardNetIncome ? round2(forwardNetIncome) : null,
      legs_used: legs.length,
      peer_count: trailingPeers.length,
      industry: company.industry,
    },
    details: {
      peers: trailingPeers,
      industry_median: trailingMedian ?? 20,
      company_metric: netIncome,
      metric_label: "Net Income (TTM)",
    },
    computed_at: new Date().toISOString(),
  };

  return {
    result,
    trailing: trailingLeg,
    forward: forwardLeg,
    peerRange: { p25: round2(p25), p75: round2(p75) },
    peerCount: trailingPeers.length,
  };
}

// --- EV/EBITDA Multiples ---

/**
 * EV/EBITDA Multiples Valuation (peer-based, trailing + forward)
 *
 * Trailing leg: Industry median EV/EBITDA × trailing EBITDA = EV − Net Debt = Equity ÷ Shares
 * Forward leg:  Industry median fwd EV/EBITDA × forward EBITDA = EV − Net Debt = Equity ÷ Shares
 * Selected = average of available legs
 */
export function calculateEVEBITDAMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const result = calculateEVEBITDAMultiplesDetailed(inputs);
  return result.result;
}

export function calculateEVEBITDAMultiplesDetailed(inputs: TradingMultiplesInputs): TradingMultiplesDetailedResult {
  const { financials, company, currentPrice, peers, forwardEBITDA } = inputs;

  const ebitda = financials.ebitda;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!ebitda || ebitda <= 0 || !sharesOutstanding) {
    return {
      result: naResult("ev_ebitda_multiples", "N/A — Negative or zero EBITDA"),
      trailing: null,
      forward: null,
      peerRange: { p25: 0, p75: 0 },
      peerCount: 0,
    };
  }

  const netDebt = (financials.total_debt || 0) - (financials.cash_and_equivalents || 0);

  // Trailing EV/EBITDA peers
  const { validPeers: trailingPeers, values: trailingValues } =
    extractValidMultiples(peers, (p) => p.ev_ebitda, 100);
  const trailingMedian = trailingValues.length > 0 ? median(trailingValues) : null;
  const { p25, p75 } = percentiles(trailingValues, trailingMedian ?? 15);

  // Forward EV/EBITDA peers
  const { values: forwardValues } =
    extractValidMultiples(peers, (p) => p.forward_ev_ebitda, 100);
  const forwardMedian = forwardValues.length > 0 ? median(forwardValues) : null;

  // Build legs
  let trailingLeg: MultipleLeg | null = null;
  if (trailingMedian !== null) {
    const ev = trailingMedian * ebitda;
    const equityValue = ev - netDebt;
    trailingLeg = {
      type: "trailing",
      industryMedian: trailingMedian,
      companyMetric: ebitda,
      metricLabel: "EBITDA (TTM)",
      fairPrice: equityValue / sharesOutstanding,
      enterpriseValue: ev,
      equityValue,
    };
  }

  let forwardLeg: MultipleLeg | null = null;
  if (forwardMedian !== null && forwardEBITDA && forwardEBITDA > 0) {
    const ev = forwardMedian * forwardEBITDA;
    const equityValue = ev - netDebt;
    forwardLeg = {
      type: "forward",
      industryMedian: forwardMedian,
      companyMetric: forwardEBITDA,
      metricLabel: "EBITDA (Forward)",
      fairPrice: equityValue / sharesOutstanding,
      enterpriseValue: ev,
      equityValue,
    };
  }

  // Selected = average of available legs
  const legs = [trailingLeg, forwardLeg].filter((l): l is MultipleLeg => l !== null);
  if (legs.length === 0) {
    return {
      result: naResult("ev_ebitda_multiples", "N/A — Insufficient peer EV/EBITDA data"),
      trailing: null,
      forward: null,
      peerRange: { p25: 0, p75: 0 },
      peerCount: 0,
    };
  }

  const fairValue = Math.max(0, legs.reduce((sum, l) => sum + l.fairPrice, 0) / legs.length);
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Low/high from trailing p25/p75
  const lowFairPrice = Math.max(0, (p25 * ebitda - netDebt) / sharesOutstanding);
  const highFairPrice = Math.max(0, (p75 * ebitda - netDebt) / sharesOutstanding);

  const result: ValuationResult = {
    model_type: "ev_ebitda_multiples",
    fair_value: round2(fairValue),
    upside_percent: round2(upside),
    low_estimate: round2(lowFairPrice),
    high_estimate: round2(highFairPrice),
    assumptions: {
      method: "peer_comparison",
      trailing_median: trailingMedian !== null ? round2(trailingMedian) : null,
      forward_median: forwardMedian !== null ? round2(forwardMedian) : null,
      trailing_ebitda: round2(ebitda),
      forward_ebitda: forwardEBITDA ? round2(forwardEBITDA) : null,
      legs_used: legs.length,
      net_debt: round2(netDebt),
      shares_outstanding: sharesOutstanding,
      peer_count: trailingPeers.length,
      industry: company.industry,
    },
    details: {
      peers: trailingPeers,
      industry_median: trailingMedian ?? 15,
      company_metric: ebitda,
      metric_label: "EBITDA (TTM)",
    },
    computed_at: new Date().toISOString(),
  };

  return {
    result,
    trailing: trailingLeg,
    forward: forwardLeg,
    peerRange: { p25: round2(p25), p75: round2(p75) },
    peerCount: trailingPeers.length,
  };
}

// --- EV/Revenue Multiples ---

/**
 * EV/Revenue Multiples Valuation (peer-based, trailing + forward)
 *
 * Trailing leg: Industry median EV/Revenue × trailing Revenue = EV − Net Debt = Equity ÷ Shares
 * Forward leg:  Industry median fwd EV/Revenue × forward Revenue = EV − Net Debt = Equity ÷ Shares
 * Selected = average of available legs
 *
 * Primary use: pre-profit companies where P/E and EV/EBITDA are not applicable.
 */
export function calculateEVRevenueMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  return calculateEVRevenueMultiplesDetailed(inputs).result;
}

export function calculateEVRevenueMultiplesDetailed(inputs: TradingMultiplesInputs): TradingMultiplesDetailedResult {
  const { financials, company, currentPrice, peers, forwardRevenue } = inputs;

  const revenue = financials.revenue;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!revenue || revenue <= 0 || !sharesOutstanding) {
    return {
      result: naResult("ev_revenue_multiples", "N/A — No revenue data"),
      trailing: null, forward: null,
      peerRange: { p25: 0, p75: 0 }, peerCount: 0,
    };
  }

  const netDebt = (financials.total_debt || 0) - (financials.cash_and_equivalents || 0);

  // Trailing EV/Revenue peers
  const { validPeers: trailingPeers, values: trailingValues } =
    extractValidMultiples(peers, (p) => p.ev_revenue, 200);
  const trailingMedian = trailingValues.length > 0 ? median(trailingValues) : null;
  const { p25, p75 } = percentiles(trailingValues, trailingMedian ?? 5);

  // Forward EV/Revenue peers
  const { values: forwardValues } =
    extractValidMultiples(peers, (p) => p.forward_ev_revenue, 200);
  const forwardMedian = forwardValues.length > 0 ? median(forwardValues) : null;

  // Build legs
  let trailingLeg: MultipleLeg | null = null;
  if (trailingMedian !== null) {
    const ev = trailingMedian * revenue;
    const equityValue = ev - netDebt;
    trailingLeg = {
      type: "trailing", industryMedian: trailingMedian,
      companyMetric: revenue, metricLabel: "Revenue (TTM)",
      fairPrice: equityValue / sharesOutstanding,
      enterpriseValue: ev, equityValue,
    };
  }

  let forwardLeg: MultipleLeg | null = null;
  if (forwardMedian !== null && forwardRevenue && forwardRevenue > 0) {
    const ev = forwardMedian * forwardRevenue;
    const equityValue = ev - netDebt;
    forwardLeg = {
      type: "forward", industryMedian: forwardMedian,
      companyMetric: forwardRevenue, metricLabel: "Revenue (Forward)",
      fairPrice: equityValue / sharesOutstanding,
      enterpriseValue: ev, equityValue,
    };
  }

  const legs = [trailingLeg, forwardLeg].filter((l): l is MultipleLeg => l !== null);
  if (legs.length === 0) {
    return {
      result: naResult("ev_revenue_multiples", "N/A — Insufficient peer EV/Revenue data"),
      trailing: null, forward: null,
      peerRange: { p25: 0, p75: 0 }, peerCount: 0,
    };
  }

  const fairValue = Math.max(0, legs.reduce((sum, l) => sum + l.fairPrice, 0) / legs.length);
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;
  const lowFairPrice = Math.max(0, (p25 * revenue - netDebt) / sharesOutstanding);
  const highFairPrice = Math.max(0, (p75 * revenue - netDebt) / sharesOutstanding);

  return {
    result: {
      model_type: "ev_revenue_multiples",
      fair_value: round2(fairValue),
      upside_percent: round2(upside),
      low_estimate: round2(lowFairPrice),
      high_estimate: round2(highFairPrice),
      assumptions: {
        method: "peer_comparison",
        trailing_median: trailingMedian !== null ? round2(trailingMedian) : null,
        forward_median: forwardMedian !== null ? round2(forwardMedian) : null,
        trailing_revenue: round2(revenue),
        forward_revenue: forwardRevenue ? round2(forwardRevenue) : null,
        legs_used: legs.length,
        net_debt: round2(netDebt),
        shares_outstanding: sharesOutstanding,
        peer_count: trailingPeers.length,
        industry: company.industry,
      },
      details: {
        peers: trailingPeers,
        industry_median: trailingMedian ?? 5,
        company_metric: revenue,
        metric_label: "Revenue (TTM)",
      },
      computed_at: new Date().toISOString(),
    },
    trailing: trailingLeg, forward: forwardLeg,
    peerRange: { p25: round2(p25), p75: round2(p75) },
    peerCount: trailingPeers.length,
  };
}