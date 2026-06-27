/**
 * Shared types, field configs, and formatting helpers for the Financials tab
 * sections. Pure (no JSX) so each section file can pull only what it needs.
 */

import { formatLargeNumber, formatRatio } from "@/lib/format";

export type Rec = Record<string, unknown>;
export interface Row {
  fiscalDate: string;
  data: Rec;
}
export interface Financials {
  symbol: string;
  period: string;
  income: Row[];
  cashflow: Row[];
  balance: Row[];
  ratios: Row[];
  estimates?: Row[];
}

export const num = (d: Rec, k: string): number | null => {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
export const div = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b !== 0 ? a / b : null;
export const add = (a: number | null, b: number | null): number | null => (a != null && b != null ? a + b : null);

/** Index statement rows by fiscal date → raw FMP `data` jsonb. */
export const byDate = (rows: Row[]): Map<string, Rec> => new Map(rows.map((r) => [r.fiscalDate, r.data]));

// ---------- 2. Trend overview ----------
export type Kind = "money" | "pct" | "ratio" | "count";
export interface Metric {
  label: string;
  kind: Kind;
  better: 1 | -1;
  fn: (inc: Rec, cf: Rec, bal: Rec, rat: Rec) => number | null;
}
export const METRICS: Metric[] = [
  { label: "Revenue", kind: "money", better: 1, fn: (i) => num(i, "revenue") },
  { label: "Gross margin", kind: "pct", better: 1, fn: (i, _c, _b, r) => num(r, "grossProfitMargin") ?? div(num(i, "grossProfit"), num(i, "revenue")) },
  { label: "Operating margin", kind: "pct", better: 1, fn: (i) => div(num(i, "operatingIncome"), num(i, "revenue")) },
  { label: "Net margin", kind: "pct", better: 1, fn: (i, _c, _b, r) => num(r, "netProfitMargin") ?? div(num(i, "netIncome"), num(i, "revenue")) },
  { label: "Net income", kind: "money", better: 1, fn: (i) => num(i, "netIncome") },
  { label: "Free cash flow", kind: "money", better: 1, fn: (_i, c) => num(c, "freeCashFlow") ?? add(num(c, "operatingCashFlow"), num(c, "capitalExpenditure")) },
  { label: "FCF margin", kind: "pct", better: 1, fn: (i, c) => div(num(c, "freeCashFlow") ?? add(num(c, "operatingCashFlow"), num(c, "capitalExpenditure")), num(i, "revenue")) },
  { label: "ROE", kind: "pct", better: 1, fn: (i, _c, b, r) => num(r, "returnOnEquity") ?? div(num(i, "netIncome"), num(b, "totalStockholdersEquity")) },
  { label: "Debt / Equity", kind: "ratio", better: -1, fn: (_i, _c, b, r) => num(r, "debtToEquityRatio") ?? div(num(b, "totalDebt"), num(b, "totalStockholdersEquity")) },
  { label: "Shares (diluted)", kind: "count", better: -1, fn: (i) => num(i, "weightedAverageShsOutDil") },
];

export function fmtKind(kind: Kind, v: number | null): string {
  if (v == null) return "—";
  switch (kind) {
    case "money":
      return formatLargeNumber(v);
    case "pct":
      return formatRatio(v);
    case "ratio":
      return `${v.toFixed(2)}x`;
    case "count":
      return formatLargeNumber(v, { prefix: "", decimals: 2 });
  }
}

export function lastTwo(values: (number | null)[]): { latest: number | null; prev: number | null } {
  return { latest: values.at(-1) ?? null, prev: values.length >= 2 ? (values.at(-2) ?? null) : null };
}

// ---------- 3. Statement line-item configs (raw FMP fields) ----------
export type LineKind = "money" | "pershare" | "count";
export interface Line {
  label: string;
  field: string;
  kind: LineKind;
}
export const INCOME_LINES: Line[] = [
  { label: "Revenue", field: "revenue", kind: "money" },
  { label: "Cost of revenue", field: "costOfRevenue", kind: "money" },
  { label: "Gross profit", field: "grossProfit", kind: "money" },
  { label: "R&D", field: "researchAndDevelopmentExpenses", kind: "money" },
  { label: "SG&A", field: "sellingGeneralAndAdministrativeExpenses", kind: "money" },
  { label: "Operating income", field: "operatingIncome", kind: "money" },
  { label: "Interest expense", field: "interestExpense", kind: "money" },
  { label: "Pretax income", field: "incomeBeforeTax", kind: "money" },
  { label: "Income tax", field: "incomeTaxExpense", kind: "money" },
  { label: "Net income", field: "netIncome", kind: "money" },
  { label: "EBITDA", field: "ebitda", kind: "money" },
  { label: "EPS (diluted)", field: "epsDiluted", kind: "pershare" },
  { label: "Shares (diluted)", field: "weightedAverageShsOutDil", kind: "count" },
];
// FMP analyst-estimates only forecasts revenue + EPS — map those income rows to
// the estimate fields; all other rows stay blank in forecast columns.
export const INCOME_ESTIMATE_MAP: Record<string, string> = { revenue: "revenueAvg", epsDiluted: "epsAvg" };

export const BALANCE_LINES: Line[] = [
  { label: "Cash & equivalents", field: "cashAndCashEquivalents", kind: "money" },
  { label: "Receivables", field: "accountsReceivables", kind: "money" },
  { label: "Inventory", field: "inventory", kind: "money" },
  { label: "Total assets", field: "totalAssets", kind: "money" },
  { label: "Total debt", field: "totalDebt", kind: "money" },
  { label: "Net debt", field: "netDebt", kind: "money" },
  { label: "Payables", field: "accountPayables", kind: "money" },
  { label: "Total liabilities", field: "totalLiabilities", kind: "money" },
  { label: "Total equity", field: "totalStockholdersEquity", kind: "money" },
];
export const CASHFLOW_LINES: Line[] = [
  { label: "Operating cash flow", field: "operatingCashFlow", kind: "money" },
  { label: "Capital expenditure", field: "capitalExpenditure", kind: "money" },
  { label: "Free cash flow", field: "freeCashFlow", kind: "money" },
  { label: "D&A", field: "depreciationAndAmortization", kind: "money" },
  { label: "Dividends paid", field: "commonDividendsPaid", kind: "money" },
];

export function fmtLine(kind: LineKind, v: number | null): string {
  if (v == null) return "—";
  if (kind === "pershare") return v.toFixed(2);
  if (kind === "count") return formatLargeNumber(v, { prefix: "", decimals: 2 });
  return formatLargeNumber(v);
}

// Column header: annual shows the fiscal year (2025); quarter shows year-month
// (2025-06) so multiple quarters in one calendar year stay distinct.
export const colLabel = (fiscalDate: string, period: "annual" | "quarter"): string =>
  period === "quarter" ? fiscalDate.slice(0, 7) : fiscalDate.slice(0, 4);

// ---------- 5. Peer comparison ----------
export interface Peer {
  ticker: string;
  name?: string;
  market_cap?: number | null;
  trailing_pe?: number | null;
  ev_ebitda?: number | null;
  revenue_growth?: number | null;
  net_margin?: number | null;
  roe?: number | null;
}
export interface Snapshot {
  detail?: { models?: { model_type: string; details?: { peers?: Peer[] } }[] } | null;
}

export function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

// ---------- quality scorecard ----------
export type Verdict = "good" | "ok" | "weak";
export const V_COLOR: Record<Verdict, string> = { good: "#3fb950", ok: "#d29922", weak: "#f85149" };
