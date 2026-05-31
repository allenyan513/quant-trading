// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
// ============================================================
// FCFF EBITDA Exit (5Y / 10Y)
// Same projection as Growth model but terminal value = Terminal EBITDA × peer multiple.
// ============================================================

import type { ValuationResult, DCFFCFFProjectionYear } from "../types.js";
import { type DCFFCFFInputs } from "./dcf-fcff-builders.js";
import { calculateFCFFInternal } from "./dcf-fcff-growth.js";

export interface DCFFCFFEBITDAExitInputs extends Omit<DCFFCFFInputs, "terminalGrowthRate"> {
  peerEVEBITDAMedian: number;
}

/** Build sensitivity matrix: WACC × EV/EBITDA Multiple → Fair Value */
export function buildEBITDAExitSensitivityMatrix(
  projections: DCFFCFFProjectionYear[],
  terminalEBITDA: number,
  netDebt: number,
  sharesOutstanding: number,
  baseWACC: number,
  baseMultiple: number
): { discount_rate_values: number[]; multiple_values: number[]; prices: number[][] } {
  const waccValues = [
    baseWACC - 0.02,
    baseWACC - 0.01,
    baseWACC,
    baseWACC + 0.01,
    baseWACC + 0.02,
  ].map((v) => Math.max(0.01, v));

  const multipleValues = [
    baseMultiple - 4,
    baseMultiple - 2,
    baseMultiple,
    baseMultiple + 2,
    baseMultiple + 4,
  ].map((v) => Math.max(1, v));

  const prices: number[][] = [];
  for (const wacc of waccValues) {
    const row: number[] = [];
    for (const multiple of multipleValues) {
      let pvFCFF = 0;
      for (const p of projections) {
        pvFCFF += p.fcff / Math.pow(1 + wacc, p.timing);
      }
      const tv = terminalEBITDA * multiple;
      const pvTV = tv / Math.pow(1 + wacc, projections.length);
      const ev = pvFCFF + pvTV;
      const equity = ev - netDebt;
      row.push(Math.max(0, equity / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: waccValues, multiple_values: multipleValues, prices };
}

function calculateEBITDAExitInternal(inputs: DCFFCFFEBITDAExitInputs, numYears: number): ValuationResult {
  const {
    wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    peerEVEBITDAMedian,
    usefulLife = 5,
  } = inputs;

  // Reuse all projection logic from the growth model.
  // terminalGrowthRate is a dummy value — the Gordon Growth terminal value
  // computed by calculateFCFFInternal is discarded and replaced below
  // with EBITDA × peer exit multiple.
  const baseResult = calculateFCFFInternal(
    { ...inputs, terminalGrowthRate: 0.025 },
    numYears
  );

  const terminalYear = baseResult.details.terminal_year as DCFFCFFProjectionYear;
  const projections = baseResult.details.projections as DCFFCFFProjectionYear[];

  const terminalEBITDA = terminalYear.ebitda;
  const netDebt = totalDebt - cashAndEquivalents;

  const terminalValue = terminalEBITDA * peerEVEBITDAMedian;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, numYears);
  const pvFCFFTotal = projections.reduce((sum, p) => sum + p.pv_fcff, 0);

  const enterpriseValue = pvFCFFTotal + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  const sensitivity = buildEBITDAExitSensitivityMatrix(
    projections, terminalEBITDA, netDebt, sharesOutstanding, wacc, peerEVEBITDAMedian
  );
  const allPrices = sensitivity.prices.flat().filter((p) => p > 0);

  return {
    model_type: numYears === 10 ? "dcf_fcff_ebitda_exit_10y" : "dcf_fcff_ebitda_exit_5y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: allPrices.length > 0 ? Math.min(...allPrices) : 0,
    high_estimate: allPrices.length > 0 ? Math.max(...allPrices) : 0,
    assumptions: {
      ...baseResult.assumptions,
      terminal_method: "ebitda_exit",
      peer_ev_ebitda_multiple: Math.round(peerEVEBITDAMedian * 100) / 100,
      useful_life: usefulLife,
    },
    details: {
      ...baseResult.details,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcff_total: pvFCFFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}

export function calculateDCFFCFFEBITDAExit(inputs: DCFFCFFEBITDAExitInputs): ValuationResult {
  return calculateEBITDAExitInternal(inputs, 5);
}

export function calculateDCFFCFFEBITDAExit10Y(inputs: DCFFCFFEBITDAExitInputs): ValuationResult {
  return calculateEBITDAExitInternal(inputs, 10);
}