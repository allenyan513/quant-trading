/**
 * Adapter: FMP statement/estimate JSON (as stored in the PIT tables, served by
 * @qt/shared marketdata) → the normalized model inputs the ported value-scope
 * engine expects. Sign conventions already match value-scope fixtures (capex /
 * dividends negative; D&A / FCF / net_debt positive), and the FCFF model abs()'s
 * capex regardless.
 *
 * marketdata returns rows newest-first; value-scope expects historicals sorted
 * DESC, so we preserve that order.
 */
import type { PeerMultiples } from "@qt/shared/marketdata";
import type { FinancialStatement, AnalystEstimate, Company, PeerComparison, ValuationTier } from "./types.js";

type J = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Merge FMP income + balance + cash-flow rows (each keyed by fiscal date) into FinancialStatement[]. */
export function toFinancialStatements(income: J[], balance: J[], cashflow: J[]): FinancialStatement[] {
  const keyOf = (r: J) => str(r.date) || str(r.fiscalDate);
  const bMap = new Map(balance.map((r) => [keyOf(r), r]));
  const cMap = new Map(cashflow.map((r) => [keyOf(r), r]));

  const out: FinancialStatement[] = [];
  for (const inc of income) {
    const date = keyOf(inc);
    if (!date) continue;
    const bal = bMap.get(date) ?? {};
    const cf = cMap.get(date) ?? {};

    const revenue = num(inc.revenue);
    const grossProfit = num(inc.grossProfit);
    const operatingIncome = num(inc.operatingIncome);
    const netIncome = num(inc.netIncome);
    const incomeBeforeTax = num(inc.incomeBeforeTax);
    const incomeTax = num(inc.incomeTaxExpense);
    const totalDebt = num(bal.totalDebt);
    const cash = num(bal.cashAndCashEquivalents);
    const fiscalYear = Number(inc.fiscalYear) || Number(date.slice(0, 4)) || 0;

    out.push({
      ticker: str(inc.symbol),
      period: String(fiscalYear),
      period_type: "annual",
      fiscal_year: fiscalYear,
      fiscal_quarter: null,
      // Income
      revenue,
      cost_of_revenue: num(inc.costOfRevenue),
      gross_profit: grossProfit,
      sga_expense: num(inc.sellingGeneralAndAdministrativeExpenses) || num(inc.generalAndAdministrativeExpenses),
      rnd_expense: num(inc.researchAndDevelopmentExpenses),
      operating_income: operatingIncome,
      interest_expense: num(inc.interestExpense),
      income_before_tax: incomeBeforeTax,
      income_tax: incomeTax,
      net_income: netIncome,
      ebitda: num(inc.ebitda),
      eps: num(inc.eps),
      eps_diluted: num(inc.epsDiluted),
      // Balance
      total_assets: num(bal.totalAssets),
      total_liabilities: num(bal.totalLiabilities),
      total_equity: num(bal.totalStockholdersEquity) || num(bal.totalEquity),
      total_debt: totalDebt,
      cash_and_equivalents: cash,
      net_debt: bal.netDebt != null ? num(bal.netDebt) : totalDebt - cash,
      accounts_receivable: num(bal.netReceivables) || num(bal.accountsReceivables),
      accounts_payable: num(bal.accountPayables) || num(bal.totalPayables),
      inventory: num(bal.inventory),
      // Cash flow
      operating_cash_flow: num(cf.operatingCashFlow),
      capital_expenditure: num(cf.capitalExpenditure),
      free_cash_flow: num(cf.freeCashFlow),
      depreciation_amortization: num(cf.depreciationAndAmortization) || num(inc.depreciationAndAmortization),
      dividends_paid: num(cf.commonDividendsPaid) || num(cf.netDividendsPaid),
      // Shares
      shares_outstanding: num(inc.weightedAverageShsOutDil) || num(inc.weightedAverageShsOut),
      // Derived
      tax_rate: incomeBeforeTax !== 0 ? incomeTax / incomeBeforeTax : 0,
      gross_margin: revenue !== 0 ? grossProfit / revenue : 0,
      operating_margin: revenue !== 0 ? operatingIncome / revenue : 0,
      net_margin: revenue !== 0 ? netIncome / revenue : 0,
    });
  }
  return out; // newest-first, as the models expect
}

/** Map FMP analyst-estimates rows → AnalystEstimate[]. Empty is fine (DCF falls back to trend). */
export function toAnalystEstimates(rows: J[]): AnalystEstimate[] {
  return rows
    .filter((r) => str(r.date) || r.fiscalYear != null)
    .map((r) => ({
      ticker: str(r.symbol),
      period: String(r.fiscalYear ?? str(r.date).slice(0, 4)),
      revenue_estimate: num(r.revenueAvg),
      eps_estimate: num(r.epsAvg),
      revenue_low: num(r.revenueLow),
      revenue_high: num(r.revenueHigh),
      eps_low: num(r.epsLow),
      eps_high: num(r.epsHigh),
      number_of_analysts: num(r.numAnalystsRevenue) || num(r.numAnalystsEps) || num(r.numAnalysts),
    }));
}

/** Map shared marketdata PeerMultiples → the engine's PeerComparison (unknown fields → null). */
export function toPeerComparisons(peers: PeerMultiples[]): PeerComparison[] {
  return peers.map((p) => ({
    ticker: p.ticker,
    name: "",
    market_cap: p.market_cap ?? 0,
    trailing_pe: p.trailing_pe,
    forward_pe: null,
    ev_ebitda: p.ev_ebitda,
    forward_ev_ebitda: null,
    ev_revenue: p.ev_revenue,
    forward_ev_revenue: null,
    price_to_book: null,
    price_to_sales: p.ev_revenue,
    revenue_growth: null,
    net_margin: null,
    roe: null,
  }));
}

/** Build the Company input from an FMP `profile` row + the latest statement (for shares) + current price. */
export function toCompany(profile: J | null, latest: FinancialStatement | undefined, price: number | null): Company {
  const p = profile ?? {};
  const shares = num(p.sharesOutstanding) || (latest?.shares_outstanding ?? 0);
  const px = price ?? num(p.price);
  const tier: ValuationTier = latest && latest.net_income > 0 ? "full" : latest ? "pre_profit" : "none";
  return {
    ticker: str(p.symbol) || (latest?.ticker ?? ""),
    name: str(p.companyName),
    sector: str(p.sector),
    industry: str(p.industry),
    market_cap: num(p.marketCap) || (px && shares ? px * shares : 0),
    beta: num(p.beta) || 1.0,
    price: px,
    shares_outstanding: shares,
    exchange: str(p.exchange) || str(p.exchangeShortName),
    description: str(p.description),
    logo_url: typeof p.image === "string" ? p.image : null,
    updated_at: new Date().toISOString(),
    has_valuation: tier !== "none",
    valuation_tier: tier,
    reporting_currency: str(p.currency) || "USD",
  };
}
