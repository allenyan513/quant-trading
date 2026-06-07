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
