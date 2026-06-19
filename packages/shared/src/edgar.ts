/**
 * SEC EDGAR client + XBRL→statement mapper — the free, official source for
 * quarterly (10-Q) financials that FMP's free tier gates behind a paid plan.
 *
 * We deliberately consume the **companyfacts** API (`/api/xbrl/companyfacts/`)
 * rather than raw XBRL instance documents: companyfacts already returns
 * pre-structured JSON facts (concept / unit / period / filed), so the heavy
 * lifting that full XBRL processors (Arelle, edgartools) exist for — taxonomy /
 * linkbase resolution, dimensional contexts — is done for us. What remains is a
 * focused mapping layer: us-gaap concept → FMP field name, instant-vs-duration,
 * and quarterly-vs-YTD selection. The concept priority lists below are informed
 * by edgartools' (MIT) mapping conventions.
 *
 * The mapper emits **FMP-shaped rows** (same field names FMP returns) so the
 * existing read-through cache + valuation adapter consume them unchanged.
 *
 * Pure (mapper) + thin HTTP client, no DB — mirrors fmp.ts. The read-through /
 * persistence wiring lives in marketdata/index.ts.
 */
import { secGet, SecError } from "./sec-http.js";

const SEC_DATA_BASE = "https://data.sec.gov";
const SEC_WWW_BASE = "https://www.sec.gov";

/** Back-compat alias — SEC fetch errors are now the shared `SecError`. */
export const EdgarError = SecError;

// ───────────────────────── ticker → CIK ─────────────────────────
// company_tickers.json maps every ticker to its zero-paddable CIK. Cached in
// memory for the process; it changes rarely (new listings).

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}
let tickerMap: Map<string, number> | null = null;
let tickerMapInFlight: Promise<Map<string, number>> | null = null;

export async function loadTickerMap(): Promise<Map<string, number>> {
  if (tickerMap) return tickerMap;
  // Collapse concurrent first-load calls onto one fetch — many symbols warming
  // at once must not each pull this (large) file. Reset on settle so a transient
  // failure retries instead of poisoning every future caller.
  if (!tickerMapInFlight) {
    tickerMapInFlight = (async () => {
      const raw = await secGet<Record<string, TickerRow>>(`${SEC_WWW_BASE}/files/company_tickers.json`);
      const m = new Map<string, number>();
      if (raw) for (const row of Object.values(raw)) m.set(row.ticker.toUpperCase(), row.cik_str);
      tickerMap = m;
      return m;
    })().finally(() => {
      tickerMapInFlight = null;
    });
  }
  return tickerMapInFlight;
}

/** 10-digit zero-padded CIK as the companyfacts path expects. */
export const padCik = (cik: number): string => String(cik).padStart(10, "0");

export async function tickerToCik(symbol: string): Promise<number | null> {
  const m = await loadTickerMap();
  return m.get(symbol.toUpperCase()) ?? null;
}

// ───────────────────────── companyfacts types ─────────────────────────

export interface XbrlFact {
  start?: string; // present for duration concepts (income / cash flow)
  end: string; // period end (instant) or duration end
  val: number;
  accn?: string;
  fy?: number;
  fp?: string; // "Q1" | "Q2" | "Q3" | "FY"
  form?: string; // "10-Q" | "10-K" | ...
  filed: string; // filing date → known_at (PIT)
  frame?: string;
}
interface XbrlConcept {
  units: Record<string, XbrlFact[]>;
}
export interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: { "us-gaap"?: Record<string, XbrlConcept>; dei?: Record<string, XbrlConcept> };
}

// ───────────────────────── concept → FMP field maps ─────────────────────────
// Each FMP field maps to an ordered list of candidate us-gaap concepts; the
// first one present in the filing wins (companies tag the same line differently).

export const INCOME_CONCEPTS: Record<string, string[]> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ],
  costOfRevenue: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"],
  grossProfit: ["GrossProfit"],
  researchAndDevelopmentExpenses: ["ResearchAndDevelopmentExpense"],
  sellingGeneralAndAdministrativeExpenses: ["SellingGeneralAndAdministrativeExpense"],
  generalAndAdministrativeExpenses: ["GeneralAndAdministrativeExpense"],
  operatingIncome: ["OperatingIncomeLoss"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating"],
  incomeBeforeTax: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  incomeTaxExpense: ["IncomeTaxExpenseBenefit"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  eps: ["EarningsPerShareBasic"],
  epsDiluted: ["EarningsPerShareDiluted"],
  weightedAverageShsOut: ["WeightedAverageNumberOfSharesOutstandingBasic"],
  weightedAverageShsOutDil: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
};

const BALANCE_CONCEPTS: Record<string, string[]> = {
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  totalStockholdersEquity: ["StockholdersEquity"],
  totalEquity: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cashAndCashEquivalents: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  netReceivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  accountPayables: ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
  inventory: ["InventoryNet"],
};
// totalDebt has no single tag; composed from current + non-current debt below.
const DEBT_NONCURRENT = ["LongTermDebtNoncurrent", "LongTermDebt"];
const DEBT_CURRENT = ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"];

const CASHFLOW_CONCEPTS: Record<string, string[]> = {
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  depreciationAndAmortization: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
  ],
};
// Sign-flipped to FMP convention (outflows negative): XBRL reports these positive.
const CAPEX_CONCEPTS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"];
const DIVIDENDS_CONCEPTS = ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"];

// ───────────────────────── pure mapping helpers (unit-tested) ─────────────────────────

const daysBetween = (aISO: string, bISO: string): number => Math.abs(Date.parse(bISO) - Date.parse(aISO)) / 86_400_000;

// Local period type — deliberately NOT imported from marketdata (which imports
// this module) to avoid a cycle. Mirrors marketdata's StatementPeriod literals.
type Period = "annual" | "quarter";

/** A duration fact ~one fiscal quarter long (13–14 weeks), excluding 6/9-mo YTD and annual. */
export function isQuarterDuration(f: XbrlFact): boolean {
  if (!f.start) return false;
  const d = daysBetween(f.start, f.end);
  return d >= 80 && d <= 100;
}

/** A duration fact ~one full fiscal year long, covering 52/53-week and calendar
 *  years; excludes the quarter (~90d) and 9-month YTD (~270d). 10-K only. */
export function isAnnualDuration(f: XbrlFact): boolean {
  if (!f.start) return false;
  const d = daysBetween(f.start, f.end);
  return d >= 350 && d <= 380;
}

/** Per-period selection knobs: which filing form carries the figure, the
 *  duration predicate for income/cash-flow facts, and the FMP `period` literal. */
const PERIOD_SPEC: Record<Period, { form: string; duration: (f: XbrlFact) => boolean; label: string }> = {
  quarter: { form: "10-Q", duration: isQuarterDuration, label: "Q" },
  annual: { form: "10-K", duration: isAnnualDuration, label: "FY" },
};

interface PickedFact {
  val: number;
  filed: string;
}

/**
 * For one concept's facts: keep only those matching `pred` and filed on `form`
 * (10-Q for quarters, 10-K for annual), group by period-end, and take the
 * **earliest-filed** per end (the original filing — PIT-correct known_at; later
 * restatements/comparatives ignored).
 */
export function selectByEnd(
  facts: XbrlFact[],
  pred: (f: XbrlFact) => boolean,
  form = "10-Q",
): Map<string, PickedFact> {
  const byEnd = new Map<string, PickedFact>();
  for (const f of facts) {
    if (f.form !== form) continue;
    if (!pred(f)) continue;
    const prev = byEnd.get(f.end);
    if (!prev || f.filed < prev.filed) byEnd.set(f.end, { val: f.val, filed: f.filed });
  }
  return byEnd;
}

const usGaap = (facts: CompanyFacts, concept: string): XbrlFact[] => {
  const c = facts.facts?.["us-gaap"]?.[concept];
  if (!c) return [];
  // EPS lives under "USD/shares", share counts under "shares", money under "USD".
  return c.units["USD"] ?? c.units["USD/shares"] ?? c.units["shares"] ?? Object.values(c.units)[0] ?? [];
};

/**
 * Merge candidate concepts by period-end. Candidates are alternative tags for
 * the *same* line (priority-ordered), so the highest-priority concept present
 * for a given end wins, and lower-priority ones only fill ends it doesn't cover.
 * (A single concept rarely spans every period — e.g. a filer that migrated
 * `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` mid-history
 * needs both to cover all years.) Empty map if no candidate is present.
 */
function resolve(
  facts: CompanyFacts,
  candidates: string[],
  pred: (f: XbrlFact) => boolean,
  form: string,
): Map<string, PickedFact> {
  const merged = new Map<string, PickedFact>();
  for (const concept of candidates) {
    for (const [end, pick] of selectByEnd(usGaap(facts, concept), pred, form)) {
      if (!merged.has(end)) merged.set(end, pick);
    }
  }
  return merged;
}

type Row = Record<string, unknown>;

/**
 * Assemble FMP-shaped rows for one statement from a field→concept spec. `kind`
 * picks instant (balance) vs quarter-duration (income/cash flow) selection.
 * Rows are keyed by period-end; `known_at` (as `acceptedDate`) is that period's
 * original filing date. Returned newest-first (marketdata's convention).
 */
function buildRows(
  symbol: string,
  facts: CompanyFacts,
  spec: Record<string, string[]>,
  kind: "duration" | "instant",
  period: Period,
): Map<string, Row> {
  const { form, duration, label } = PERIOD_SPEC[period];
  const pred = kind === "instant" ? (f: XbrlFact) => f.start === undefined : duration;
  const rows = new Map<string, Row>();
  const filedByEnd = new Map<string, string>();

  const ensure = (end: string): Row => {
    let r = rows.get(end);
    if (!r) {
      r = { symbol, date: end, period: label };
      rows.set(end, r);
    }
    return r;
  };

  for (const [field, candidates] of Object.entries(spec)) {
    const picks = resolve(facts, candidates, pred, form);
    for (const [end, pick] of picks) {
      ensure(end)[field] = pick.val;
      // Track the latest filing across the row's fields as its knowable moment.
      const prev = filedByEnd.get(end);
      if (!prev || pick.filed > prev) filedByEnd.set(end, pick.filed);
    }
  }
  for (const [end, r] of rows) {
    r.acceptedDate = filedByEnd.get(end);
    r.fiscalYear = Number(end.slice(0, 4));
  }
  return rows;
}

export interface EdgarStatements {
  income: Row[];
  balance: Row[];
  cashflow: Row[];
}

/**
 * Map a companyfacts payload to FMP-shaped quarterly income / balance /
 * cash-flow rows (newest-first). Derives the fields FMP supplies but XBRL has no
 * single tag for: total debt (current+non-current), EBITDA (operating income +
 * D&A), and free cash flow (OCF − capex). Sign conventions match FMP/value-scope
 * (capex & dividends negative).
 */
export function mapCompanyFactsToStatements(symbol: string, facts: CompanyFacts, period: Period): EdgarStatements {
  const sym = symbol.toUpperCase();
  const { form, duration } = PERIOD_SPEC[period];
  const newestFirst = (rows: Map<string, Row>): Row[] =>
    [...rows.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // Income — duration; add derived EBITDA = operatingIncome + D&A.
  const incomeRows = buildRows(sym, facts, INCOME_CONCEPTS, "duration", period);
  const daDuration = resolve(facts, CASHFLOW_CONCEPTS.depreciationAndAmortization!, duration, form);
  for (const [end, r] of incomeRows) {
    const oi = typeof r.operatingIncome === "number" ? r.operatingIncome : undefined;
    const da = daDuration.get(end)?.val;
    if (oi !== undefined && da !== undefined) r.ebitda = oi + da;
  }

  // Balance — instant; compose total debt from current + non-current.
  const balanceRows = buildRows(sym, facts, BALANCE_CONCEPTS, "instant", period);
  const instant = (f: XbrlFact) => f.start === undefined;
  const debtNon = resolve(facts, DEBT_NONCURRENT, instant, form);
  const debtCur = resolve(facts, DEBT_CURRENT, instant, form);
  for (const [end, r] of balanceRows) {
    const total = (debtNon.get(end)?.val ?? 0) + (debtCur.get(end)?.val ?? 0);
    if (total > 0) r.totalDebt = total;
  }

  // Cash flow — duration; negate outflows to FMP sign, derive FCF = OCF − capex.
  const cashflowRows = buildRows(sym, facts, CASHFLOW_CONCEPTS, "duration", period);
  const capex = resolve(facts, CAPEX_CONCEPTS, duration, form);
  const dividends = resolve(facts, DIVIDENDS_CONCEPTS, duration, form);
  for (const [end, r] of cashflowRows) {
    const capexVal = capex.get(end)?.val;
    if (capexVal !== undefined) r.capitalExpenditure = -Math.abs(capexVal);
    const div = dividends.get(end)?.val;
    if (div !== undefined) r.commonDividendsPaid = -Math.abs(div);
    const ocf = typeof r.operatingCashFlow === "number" ? r.operatingCashFlow : undefined;
    if (ocf !== undefined && capexVal !== undefined) r.freeCashFlow = ocf - Math.abs(capexVal);
  }

  return { income: newestFirst(incomeRows), balance: newestFirst(balanceRows), cashflow: newestFirst(cashflowRows) };
}

// ───────────────────────── client ─────────────────────────

const factsInFlight = new Map<number, Promise<CompanyFacts | null>>();

/** Fetch a company's full XBRL companyfacts (all concepts, all periods).
 *  Concurrent calls for the same CIK collapse onto one request — the payload is
 *  large (often >10 MB) and warming income+balance+cashflow × annual+quarter
 *  would otherwise pull it up to 6× at once, risking SEC rate limits. */
export async function fetchCompanyFacts(cik: number): Promise<CompanyFacts | null> {
  const existing = factsInFlight.get(cik);
  if (existing) return existing;
  const p = secGet<CompanyFacts>(`${SEC_DATA_BASE}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`).finally(() =>
    factsInFlight.delete(cik),
  );
  factsInFlight.set(cik, p);
  return p;
}

/** Resolve ticker → CIK → companyfacts → FMP-shaped statements for `period`
 *  (annual from 10-K, quarter from 10-Q). Null when the ticker isn't an EDGAR
 *  filer (foreign / ADR) or has no facts — callers fall back accordingly. */
export async function fetchStatements(symbol: string, period: Period): Promise<EdgarStatements | null> {
  const cik = await tickerToCik(symbol);
  if (cik == null) return null;
  const facts = await fetchCompanyFacts(cik);
  if (!facts) return null;
  return mapCompanyFactsToStatements(symbol, facts, period);
}

/** Back-compat thin wrapper. */
export const fetchQuarterlyStatements = (symbol: string): Promise<EdgarStatements | null> =>
  fetchStatements(symbol, "quarter");
