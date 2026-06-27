/**
 * Valuation domain types — the single source of truth shared by the producer
 * (services/data's deterministic valuation engine, `src/valuation/`) and the
 * consumer (services/spa's read-only dashboard). The `data_valuation_snapshots`
 * `detail` jsonb conforms to these shapes, so both sides MUST agree on them;
 * keeping one definition here is what stops the wire contract from drifting.
 *
 * Ported from legends/value-scope/src/types/{company,financial,valuation}.ts.
 */

// --- Valuation Tier ---
export type ValuationTier = "full" | "pre_profit" | "none";

// --- Company ---
export interface Company {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number;
  beta: number;
  price: number;
  shares_outstanding: number;
  exchange: string;
  description: string;
  logo_url: string | null;
  updated_at: string;
  has_valuation: boolean; // true = full valuation models available, false = basic profile only
  valuation_tier: ValuationTier; // 'full' | 'pre_profit' | 'none'
  reporting_currency?: string; // e.g., "DKK", "EUR" — defaults to "USD"
  fx_rate_to_usd?: number; // conversion rate used at ingestion — defaults to 1.0
  peer_tickers?: string[]; // cached peer tickers from resolvePeers()
}

// --- Company Classification ---
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

export interface CompanyClassification {
  archetype: CompanyArchetype;
  label: string;
  description: string;
  traits: string[];
  model_applicability: ModelApplicability[];
}
// --- Financial Statements ---
export interface FinancialStatement {
  ticker: string;
  period: string; // "2024", "2024-Q3"
  period_type: "annual" | "quarterly";
  fiscal_year: number;
  fiscal_quarter: number | null;

  // Income Statement
  revenue: number;
  cost_of_revenue: number;
  gross_profit: number;
  sga_expense: number;
  rnd_expense: number;
  operating_income: number;
  interest_expense: number;
  income_before_tax: number;
  income_tax: number;
  net_income: number;
  ebitda: number;
  eps: number;
  eps_diluted: number;

  // Balance Sheet
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_debt: number;
  cash_and_equivalents: number;
  net_debt: number;
  accounts_receivable: number;
  accounts_payable: number;
  inventory: number;

  // Cash Flow
  operating_cash_flow: number;
  capital_expenditure: number;
  free_cash_flow: number;
  depreciation_amortization: number;
  dividends_paid: number;

  // Shares
  shares_outstanding: number;

  // Derived
  tax_rate: number; // effective
  gross_margin: number;
  operating_margin: number;
  net_margin: number;
}

// --- Analyst Estimates ---
export interface AnalystEstimate {
  ticker: string;
  period: string; // "2025", "2026"
  revenue_estimate: number;
  eps_estimate: number;
  revenue_low: number;
  revenue_high: number;
  eps_low: number;
  eps_high: number;
  number_of_analysts: number;
}

// --- Price Target Consensus ---
export interface PriceTargetConsensus {
  ticker: string;
  target_high: number;
  target_low: number;
  target_consensus: number;
  target_median: number;
  number_of_analysts: number;
}

// --- Earnings Surprise ---
export interface EarningsSurprise {
  date: string;
  actual_eps: number;
  estimated_eps: number;
  surprise_percent: number;
}

// --- Analyst Recommendation (Buy/Hold/Sell distribution) ---
export interface AnalystRecommendation {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  totalAnalysts: number;
  consensus: string;
}

// --- Upgrade / Downgrade ---
export interface UpgradeDowngrade {
  date: string;
  gradingCompany: string;
  previousGrade: string;
  newGrade: string;
  action: string;
}

// --- Daily Price ---
export interface DailyPrice {
  ticker: string;
  date: string; // "2024-01-15"
  close: number;
  volume: number;
}

// --- User / Watchlist ---
export interface WatchlistItem {
  ticker: string;
  company_name: string;
  current_price: number;
  fair_value: number;
  upside_percent: number;
  added_at: string;
}

// --- Valuation Models ---
export type ValuationModelType =
  | "dcf_growth_exit_5y"
  | "dcf_growth_exit_10y"
  | "dcf_ebitda_exit_5y"
  | "dcf_ebitda_exit_10y"
  | "dcf_fcff_growth_5y"
  | "dcf_fcff_growth_10y"
  | "dcf_fcff_ebitda_exit_5y"
  | "dcf_fcff_ebitda_exit_10y"
  | "revenue_dcf_5y"
  | "revenue_dcf_10y"
  | "pe_multiples"
  | "ev_ebitda_multiples"
  | "ev_revenue_multiples"
  | "peg"
  | "epv"
  | "ddm";

export interface ValuationResult {
  model_type: ValuationModelType;
  fair_value: number;
  upside_percent: number;
  low_estimate: number;
  high_estimate: number;
  assumptions: Record<string, unknown>;
  details: Record<string, unknown>;
  computed_at: string;
}

// --- DCF Specific (FCFE approach) ---
export interface DCFProjectionYearFCFE {
  year: number;
  revenue: number;
  net_margin: number; // as decimal (e.g., 0.25 = 25%)
  net_income: number;
  depreciation_amortization: number; // D&A add-back (already deducted in Net Income)
  capital_expenditure: number;       // Total CapEx (maintenance + growth)
  fcfe: number; // FCFE = Net Income + D&A − CapEx
  discount_factor: number;
  pv_fcfe: number;
  ebitda?: number; // For exit multiple terminal value methods
  /** @deprecated Use depreciation_amortization and capital_expenditure instead */
  net_capex?: number;
}

export interface DCFFCFEResult extends ValuationResult {
  details: {
    projections: DCFProjectionYearFCFE[];
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcfe_total: number;
    cash_and_equivalents: number;
    total_debt: number;
    equity_value: number;
    shares_outstanding: number;
    sensitivity_matrix: {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

// --- DCF Specific (FCFF approach — Unlevered Free Cash Flow to Firm) ---
export interface DCFFCFFProjectionYear {
  year: number;
  revenue: number;
  revenue_growth: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  rnd: number;
  operating_income: number;
  interest_expense: number;
  income_before_tax: number;
  tax: number;
  net_income: number;
  ebitda: number;
  depreciation: number;
  capex: number;
  delta_nwc: number;
  fcff: number;
  timing: number; // mid-year convention: 0.5, 1.5, 2.5, ...
  discount_factor: number;
  pv_fcff: number;
}

export interface DCFFCFFDASchedule {
  useful_life: number;
  vintages: { capex_year: number; amounts: number[] }[];
  totals: number[];
}

export interface DCFFCFFWorkingCapital {
  dso: number;
  dpo: number;
  dio: number;
  years: number[];
  receivables: number[];
  payables: number[];
  inventory: number[];
  nwc: number[];
  delta_nwc: number[];
}

export interface DCFFCFFExpenseRatios {
  cogs_pct: number;
  sga_pct: number;
  rnd_pct: number;
  interest_pct: number;
  tax_rate: number;
}

export interface DCFFCFFResult extends ValuationResult {
  details: {
    projections: DCFFCFFProjectionYear[];
    terminal_year: DCFFCFFProjectionYear;
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcff_total: number;
    enterprise_value: number;
    net_debt: number;
    equity_value: number;
    shares_outstanding: number;
    da_schedule: DCFFCFFDASchedule;
    working_capital: DCFFCFFWorkingCapital;
    expense_ratios: DCFFCFFExpenseRatios;
    base_year: {
      year: number;
      revenue: number;
      cogs: number;
      sga: number;
      rnd: number;
      interest_expense: number;
      tax: number;
      net_income: number;
      nwc: number;
    };
    sensitivity_matrix: {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

/** @deprecated Legacy FCFF projection type — use DCFFCFFProjectionYear instead */
export interface DCFProjectionYear {
  year: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  rnd: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  tax: number;
  nopat: number;
  capex: number;
  delta_nwc: number;
  fcf: number;
  discount_factor: number;
  pv_fcf: number;
}

/** @deprecated Use DCFFCFEResult or DCFFCFFResult instead */
export interface DCFResult extends ValuationResult {
  details: {
    projections: DCFProjectionYear[];
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcf_total: number;
    enterprise_value: number;
    net_debt: number;
    equity_value: number;
    shares_outstanding: number;
    sensitivity_matrix: {
      wacc_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

// --- Trading Multiples Specific ---
export interface PeerComparison {
  ticker: string;
  name: string;
  market_cap: number;
  trailing_pe: number | null;
  forward_pe: number | null;
  ev_ebitda: number | null;
  forward_ev_ebitda: number | null;
  ev_revenue: number | null;
  forward_ev_revenue: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  revenue_growth: number | null;
  net_margin: number | null;
  roe: number | null;
}

// --- EBITDA Exit DCF Specific ---
export interface PeerEBITDARow {
  ticker: string;
  name: string;
  market_cap: number;
  trailing_ev_ebitda: number | null;
  forward_ev_ebitda: number | null;
}

export interface TradingMultiplesResult extends ValuationResult {
  details: {
    peers: PeerComparison[];
    industry_median: number;
    company_metric: number; // EPS or EBITDA
    metric_label: string;
  };
}

// --- WACC ---
export interface WACCResult {
  wacc: number;
  cost_of_equity: number;
  cost_of_debt: number;
  risk_free_rate: number;
  beta: number;
  erp: number;
  additional_risk_premium: number;
  tax_rate: number;
  debt_weight: number;
  equity_weight: number;
  total_debt: number;
  total_equity: number;
  /** Which beta approach was used */
  beta_method: "individual" | "bottom_up";
  /** Sector median unlevered beta (only set when beta_method = "bottom_up") */
  sector_unlevered_beta?: number;
}

// --- Consensus Adjustments ---
// --- Pillar Structure ---
export interface ValuationPillar {
  fairValue: number;
  upside: number;
  models: ValuationResult[];
}

export interface ValuationPillars {
  dcf: ValuationPillar;
  tradingMultiples: ValuationPillar;
  revenueMultiples: ValuationPillar;
  peg: ValuationPillar;
  epv: ValuationPillar;
  ddm: ValuationPillar;
}

export interface ValuationNarrative {
  version: "v1";
  status: "generated" | "fallback" | "failed";
  provider?: string;
  model?: string;
  generated_at?: string;
  headline: string;
  quick_take: string;
  full_narrative: string;
  seo_excerpt: string;
  confidence: "low" | "medium" | "high";
  key_drivers: string[];
  risk_flags: string[];
}

export interface ValuationNarrativeRecord {
  id?: number;
  ticker: string;
  snapshot_computed_at: string;
  narrative_version: string;
  provider?: string | null;
  model?: string | null;
  status: "generated" | "fallback" | "failed";
  facts_jsonb: NarrativeFacts;
  narrative_jsonb: ValuationNarrative;
  prompt_hash?: string | null;
  source_summary_hash?: string | null;
  generated_at: string;
  latency_ms?: number | null;
  error_message?: string | null;
}

export interface NarrativeFactsModel {
  model_type: ValuationModelType;
  label: string;
  fair_value: number;
  upside_percent: number;
}

export interface NarrativeFactsPillarSignal {
  pillar: "dcf" | "tradingMultiples" | "revenueMultiples" | "peg" | "epv" | "ddm";
  direction: "bullish" | "neutral" | "bearish" | "mixed";
  median_upside: number | null;
  model_count: number;
}

export interface NarrativeFacts {
  ticker: string;
  company_name: string;
  current_price: number;
  valuation_tier: "full" | "pre_profit";
  verdict: "undervalued" | "fairly_valued" | "overvalued";
  verdict_basis: string;
  classification_label: string;
  model_count: number;
  applicable_models: NarrativeFactsModel[];
  primary_model: NarrativeFactsModel | null;
  bullish_model: NarrativeFactsModel | null;
  bearish_model: NarrativeFactsModel | null;
  median_fair_value: number | null;
  low_fair_value: number | null;
  high_fair_value: number | null;
  spread_pct_of_median: number | null;
  price_position: "below_range" | "lower_band" | "mid_range" | "upper_band" | "above_range";
  pillar_signals: NarrativeFactsPillarSignal[];
  key_tensions: string[];
  key_drivers: string[];
  risk_flags: string[];
}

// --- Valuation Summary ---
export interface ValuationSummary {
  ticker: string;
  company_name: string;
  current_price: number;
  primary_fair_value: number;
  primary_upside: number;
  // Consensus across all applicable models
  consensus_fair_value: number;
  consensus_low: number;
  consensus_high: number;
  consensus_upside: number;
  /** Pillar breakdown for display grouping */
  pillars: ValuationPillars;
  models: ValuationResult[];
  wacc: WACCResult;
  classification: CompanyClassification;
  verdict: "undervalued" | "fairly_valued" | "overvalued";
  verdict_text: string;
  narrative?: ValuationNarrative | null;
  computed_at: string;
}

// --- Historical Multiples (for trend chart + self-comparison valuation) ---
export interface HistoricalMultiplesPoint {
  date: string;
  pe: number | null;
  ev_ebitda: number | null;
}

export interface MultipleStats {
  current: number | null;
  avg5y: number;
  p25: number;
  p75: number;
  percentile: number; // 0-100, where current sits vs history
  dataPoints: number;
}

export interface HistoricalMultiplesResponse {
  history: HistoricalMultiplesPoint[];
  stats: {
    pe: MultipleStats | null;
    ev_ebitda: MultipleStats | null;
  };
}

// ============================================================
// Per-model detail shapes. The engine (services/data) emits these as the
// `details` jsonb of the corresponding ValuationResult; the dashboard reads them
// back. Kept here alongside the result types so producer and consumer share one
// definition.
// ============================================================

// --- Revenue DCF ---
export interface RevenueDCFProjectionYear {
  year: number;
  revenue: number;
  revenue_growth: number;
  operating_margin: number;
  operating_income: number;
  tax: number;
  nopat: number;
  depreciation: number;
  capex: number;
  delta_nwc: number;
  fcff: number;
  timing: number;
  discount_factor: number;
  pv_fcff: number;
}

// --- PEG ---
export type PEGGrowthSource = "forward" | "historical" | "blended";

export interface PEGDetails {
  growth_rate: number;
  raw_growth_rate: number;
  growth_source: PEGGrowthSource;
  dividend_yield: number;
  adjusted_growth: number;
  fair_pe: number;
  ttm_eps: number;
  ntm_eps: number | null;
  eps_used: number;
  eps_label: string;
  growth_clamped: boolean;
  years_used: number;
  peg_ratio: number | null;
  current_pe: number | null;
  forward_growth: number | null;
  forward_years: number | null;
  forward_estimates: Array<{
    period: string;
    eps: number;
    growth_pct: number | null;
    analysts: number;
  }>;
  historical_growth: number | null;
  historical_years: number | null;
  earnings_history: Array<{
    year: number;
    net_income: number;
    eps: number;
    yoy_growth: number | null;
  }>;
}

// --- EPV ---
export interface EPVHistoricalYear {
  year: number;
  revenue: number;
  gross_profit: number;
  gross_margin: number;
  rnd: number;
  sga: number;
  total_opex: number;
  opex_pct: number;
  capex: number;
  da: number;
  capex_minus_da: number;
  tax_rate: number;
}

export interface EPVDetails {
  historical: EPVHistoricalYear[];
  sustainable_revenue: number;
  sustainable_gross_margin: number;
  sustainable_gross_profit: number;
  maintenance_opex_pct: number;
  maintenance_opex: number;
  normalized_ebit: number;
  avg_tax_rate: number;
  after_tax_normalized_ebit: number;
  avg_capex_minus_da: number;
  normalized_earnings: number;
  wacc: number;
  wacc_low: number;
  wacc_high: number;
  enterprise_value: number;
  enterprise_value_low: number;
  enterprise_value_high: number;
  net_debt: number;
  equity_value: number;
  equity_value_low: number;
  equity_value_high: number;
  shares_outstanding: number;
}

// --- DDM ---
export type DDMGrowthSource =
  | "historical_dps_cagr"
  | "analyst_eps_cagr"
  | "blended"
  | "gdp_fallback";

export interface DDMHistoricalDPS {
  year: number;
  dividends_paid: number;
  shares_outstanding: number;
  dps: number;
  net_income: number;
  payout_ratio: number | null;
  yoy_growth: number | null;
}

export interface DDMProjectionYear {
  year: number;
  dps: number;
  growth_rate: number;
  discount_factor: number;
  pv: number;
}

export interface DDMDetails {
  current_dps: number;
  dividend_yield: number;
  payout_ratio: number | null;
  fcf_payout_ratio: number | null;
  dividend_coverage: number | null;
  historical_dps: DDMHistoricalDPS[];
  dps_cagr: number | null;
  dps_cagr_years: number | null;
  near_term_growth: number;
  growth_source: DDMGrowthSource;
  analyst_eps_growth: number | null;
  terminal_growth: number;
  cost_of_equity: number;
  projections: DDMProjectionYear[];
  pv_dividends: number;
  terminal_dps: number;
  terminal_value: number;
  pv_terminal: number;
  sensitivity_matrix: {
    ke_values: number[];
    growth_values: number[];
    prices: number[][];
  };
}
