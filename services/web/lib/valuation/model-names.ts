// Canonical model display names — single source of truth.
// Components may use a subset; import and pick what you need.

export const MODEL_NAMES: Record<string, string> = {
  // DCF FCFF models
  dcf_fcff_growth_5y: "Growth Exit 5Y",
  dcf_fcff_growth_10y: "Growth Exit 10Y",
  dcf_fcff_ebitda_exit_5y: "EBITDA Exit 5Y",
  dcf_fcff_ebitda_exit_10y: "EBITDA Exit 10Y",
  // DCF legacy keys (kept for backward compat with stored valuations)
  dcf_growth_exit_5y: "DCF Valuation",
  dcf_growth_exit_10y: "DCF — Growth Exit (10Y)",
  dcf_ebitda_exit_5y: "DCF — EBITDA Exit (5Y)",
  dcf_ebitda_exit_10y: "DCF — EBITDA Exit (10Y)",
  dcf_pe_exit_10y: "P/E Exit 10Y",
  dcf_ebitda_exit_fcfe_10y: "EV/EBITDA Exit 10Y",
  // Revenue DCF (pre-profit)
  revenue_dcf_5y: "Revenue DCF 5Y",
  revenue_dcf_10y: "Revenue DCF 10Y",
  // Trading multiples
  pe_multiples: "P/E",
  ev_ebitda_multiples: "EV/EBITDA",
  ev_revenue_multiples: "EV/Revenue",
  // PEG
  peg: "PEG Fair Value",
  // EPV
  epv: "Earnings Power Value",
  // DDM
  ddm: "Dividend Discount",
};

/** Display order for models in summary view */
export const MODEL_ORDER = [
  "dcf_fcff_growth_5y",
  "dcf_fcff_growth_10y",
  "dcf_fcff_ebitda_exit_5y",
  "dcf_fcff_ebitda_exit_10y",
  "revenue_dcf_5y",
  "revenue_dcf_10y",
  "pe_multiples",
  "ev_ebitda_multiples",
  "ev_revenue_multiples",
  "peg",
  "epv",
  "ddm",
];

/** Model type → anchor link on the unified valuation page */
export const MODEL_LINKS: Record<string, string> = {
  dcf_fcff_growth_5y: "/valuation#dcf",
  dcf_fcff_growth_10y: "/valuation#dcf",
  dcf_fcff_ebitda_exit_5y: "/valuation#dcf",
  dcf_fcff_ebitda_exit_10y: "/valuation#dcf",
  dcf_pe_exit_10y: "/valuation#dcf",
  dcf_ebitda_exit_fcfe_10y: "/valuation#dcf",
  // Legacy keys
  dcf_growth_exit_5y: "/valuation#dcf",
  dcf_growth_exit_10y: "/valuation#dcf",
  dcf_ebitda_exit_5y: "/valuation#dcf",
  dcf_ebitda_exit_10y: "/valuation#dcf",
  revenue_dcf_5y: "/valuation#dcf",
  revenue_dcf_10y: "/valuation#dcf",
  pe_multiples: "/valuation#trading-multiples",
  ev_ebitda_multiples: "/valuation#trading-multiples",
  ev_revenue_multiples: "/valuation#trading-multiples",
  peg: "/valuation#peg",
  epv: "/valuation#epv",
  ddm: "/valuation#ddm",
};
