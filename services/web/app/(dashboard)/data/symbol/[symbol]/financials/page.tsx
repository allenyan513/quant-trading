"use client";

/**
 * Financials tab — for a long-term holder. Three layers, richest at the bottom:
 *   1. Trend overview: key quality metrics with latest · YoY · sparkline.
 *   2. Full statements: income / balance sheet / cash flow, line-items × years.
 *   3. Grouped ratios (latest period): valuation / profitability / health /
 *      per-share — mostly computed from the raw statements (reliable), a few
 *      valuation multiples read from the cached ratios jsonb.
 * Reads getFinancials (annual, ~8y). All field names are raw FMP keys; missing
 * values render "—".
 */

import { Fragment } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, Grid } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { formatLargeNumber, formatRatio, fmtPct } from "@/lib/format";

type Rec = Record<string, unknown>;
interface Row {
  fiscalDate: string;
  data: Rec;
}
interface Financials {
  symbol: string;
  period: string;
  income: Row[];
  cashflow: Row[];
  balance: Row[];
  ratios: Row[];
}

const num = (d: Rec, k: string): number | null => {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const div = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b !== 0 ? a / b : null;
const add = (a: number | null, b: number | null): number | null => (a != null && b != null ? a + b : null);

// ---------- 1. Trend overview ----------
type Kind = "money" | "pct" | "ratio" | "count";
interface Metric {
  label: string;
  kind: Kind;
  better: 1 | -1;
  fn: (inc: Rec, cf: Rec, bal: Rec, rat: Rec) => number | null;
}
const METRICS: Metric[] = [
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

function fmtKind(kind: Kind, v: number | null): string {
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

function lastTwo(values: (number | null)[]): { latest: number | null; prev: number | null } {
  return {
    latest: values.at(-1) ?? null,
    prev: values.length >= 2 ? (values.at(-2) ?? null) : null,
  };
}

// ---------- 2. Statement line-item configs (raw FMP fields) ----------
type LineKind = "money" | "pershare" | "count";
interface Line {
  label: string;
  field: string;
  kind: LineKind;
}
const INCOME_LINES: Line[] = [
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
const BALANCE_LINES: Line[] = [
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
const CASHFLOW_LINES: Line[] = [
  { label: "Operating cash flow", field: "operatingCashFlow", kind: "money" },
  { label: "Capital expenditure", field: "capitalExpenditure", kind: "money" },
  { label: "Free cash flow", field: "freeCashFlow", kind: "money" },
  { label: "D&A", field: "depreciationAndAmortization", kind: "money" },
  { label: "Dividends paid", field: "commonDividendsPaid", kind: "money" },
];

function fmtLine(kind: LineKind, v: number | null): string {
  if (v == null) return "—";
  if (kind === "pershare") return `$${v.toFixed(2)}`;
  if (kind === "count") return formatLargeNumber(v, { prefix: "", decimals: 2 });
  return formatLargeNumber(v);
}

export default function FinancialsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Financials>(`/api/data/symbol/${symbol}/financials?period=annual&limit=8`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.income.length === 0)
    return <p style={{ color: "var(--muted)" }}>暂无财报缓存（点头部「⟳ 刷新数据」预热该 symbol）。</p>;

  const byDate = (rows: Row[]) => new Map(rows.map((r) => [r.fiscalDate, r.data]));
  const cf = byDate(data.cashflow);
  const bal = byDate(data.balance);
  const rat = byDate(data.ratios);

  const trend = METRICS.map((m) => {
    const series = data.income.map((r) =>
      m.fn(r.data, cf.get(r.fiscalDate) ?? {}, bal.get(r.fiscalDate) ?? {}, rat.get(r.fiscalDate) ?? {}),
    );
    const { latest, prev } = lastTwo(series);
    const yoy = div(latest != null && prev != null ? latest - prev : null, prev != null ? Math.abs(prev) : null);
    const improving = yoy == null ? null : yoy >= 0 === m.better > 0;
    return { m, series, latest, yoy, improving };
  });

  const periods = data.income.map((r) => r.fiscalDate);
  const range = periods.length ? `${periods[0]?.slice(0, 4)}–${periods.at(-1)?.slice(0, 4)}` : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TrendOverview trend={trend} range={range} />
      <RatioGroups income={data.income} balance={data.balance} cashflow={data.cashflow} ratios={data.ratios} />
      <StatementTable title="利润表 Income Statement" rows={data.income} lines={INCOME_LINES} />
      <StatementTable title="资产负债表 Balance Sheet" rows={data.balance} lines={BALANCE_LINES} />
      <StatementTable title="现金流量表 Cash Flow" rows={data.cashflow} lines={CASHFLOW_LINES} />
    </div>
  );
}

// ---------- render: trend ----------
function TrendOverview({
  trend,
  range,
}: {
  trend: { m: Metric; series: (number | null)[]; latest: number | null; yoy: number | null; improving: boolean | null }[];
  range: string;
}) {
  const cell: React.CSSProperties = { padding: "9px 0", borderBottom: "1px solid var(--border)", minWidth: 0 };
  const hdr: React.CSSProperties = { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, paddingBottom: 8, borderBottom: "1px solid var(--border)" };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace" };
  return (
    <Card title={`关键指标 · 多年趋势${range ? ` · ${range}（annual）` : ""}`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 132px", columnGap: 14, alignItems: "center" }}>
        <div style={hdr}>指标</div>
        <div style={{ ...hdr, textAlign: "right" }}>最新</div>
        <div style={{ ...hdr, textAlign: "right" }}>YoY</div>
        <div style={{ ...hdr, textAlign: "right" }}>趋势</div>
        {trend.map(({ m, series, latest, yoy, improving }) => (
          <Fragment key={m.label}>
            <div style={{ ...cell, fontSize: 13 }}>{m.label}</div>
            <div style={{ ...cell, ...mono, fontSize: 13, textAlign: "right" }}>{fmtKind(m.kind, latest)}</div>
            <div style={{ ...cell, fontSize: 12.5, textAlign: "right", fontWeight: 600, color: yoy == null ? "var(--muted)" : improving ? "#3fb950" : "#f85149" }}>
              {yoy == null ? "—" : fmtPct(yoy * 100)}
            </div>
            <div style={{ ...cell, display: "flex", justifyContent: "flex-end" }}>
              <Sparkline values={series} color={improving === false ? "#f85149" : "#3fb950"} />
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

// ---------- render: statement table ----------
function StatementTable({ title, rows, lines }: { title: string; rows: Row[]; lines: Line[] }) {
  if (rows.length === 0) return null;
  const thBase: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, whiteSpace: "nowrap" };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
  return (
    <Card title={title}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: "left", position: "sticky", left: 0, background: "var(--panel)" }}>Line item</th>
              {rows.map((r) => (
                <th key={r.fiscalDate} style={{ ...thBase, textAlign: "right" }}>
                  {r.fiscalDate.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => (
              <tr key={ln.label}>
                <td style={{ ...td, textAlign: "left", color: "var(--muted)", position: "sticky", left: 0, background: "var(--panel)" }}>{ln.label}</td>
                {rows.map((r) => (
                  <td key={r.fiscalDate} style={{ ...td, ...mono }}>
                    {fmtLine(ln.kind, num(r.data, ln.field))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- render: grouped ratios (latest period) ----------
function RatioGroups({ income, balance, cashflow, ratios }: { income: Row[]; balance: Row[]; cashflow: Row[]; ratios: Row[] }) {
  const li = income.at(-1)?.data ?? {};
  const lb = balance.at(-1)?.data ?? {};
  const lc = cashflow.at(-1)?.data ?? {};
  const lr = ratios.at(-1)?.data ?? {};
  const asOf = income.at(-1)?.fiscalDate?.slice(0, 4) ?? "";

  const ratioX = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
  const pct = (v: number | null) => (v == null ? "—" : formatRatio(v));
  const usd = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);

  const shares = num(li, "weightedAverageShsOutDil");
  const fcf = num(lc, "freeCashFlow") ?? add(num(lc, "operatingCashFlow"), num(lc, "capitalExpenditure"));

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "估值",
      items: [
        ["P/E", ratioX(num(lr, "priceToEarningsRatio"))],
        ["P/S", ratioX(num(lr, "priceToSalesRatio"))],
        ["P/B", ratioX(num(lr, "priceToBookRatio"))],
        ["EV/EBITDA", ratioX(num(lr, "enterpriseValueMultiple"))],
      ],
    },
    {
      title: "盈利",
      items: [
        ["毛利率", pct(div(num(li, "grossProfit"), num(li, "revenue")))],
        ["营业利润率", pct(div(num(li, "operatingIncome"), num(li, "revenue")))],
        ["净利率", pct(div(num(li, "netIncome"), num(li, "revenue")))],
        ["ROE", pct(div(num(li, "netIncome"), num(lb, "totalStockholdersEquity")))],
        ["ROA", pct(div(num(li, "netIncome"), num(lb, "totalAssets")))],
      ],
    },
    {
      title: "财务健康",
      items: [
        ["Debt/Equity", ratioX(div(num(lb, "totalDebt"), num(lb, "totalStockholdersEquity")))],
        ["NetDebt/EBITDA", ratioX(div(num(lb, "netDebt"), num(li, "ebitda")))],
        ["利息覆盖", ratioX(div(num(li, "operatingIncome"), num(li, "interestExpense")))],
      ],
    },
    {
      title: "每股",
      items: [
        ["EPS (摊薄)", usd(num(li, "epsDiluted"))],
        ["FCF/股", usd(div(fcf, shares))],
        ["每股净资产", usd(div(num(lb, "totalStockholdersEquity"), shares))],
      ],
    },
  ];

  return (
    <Card title={`比率分组${asOf ? ` · 最新 FY${asOf}` : ""}`}>
      <Grid min={200}>
        {groups.map((g) => (
          <div key={g.title}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{g.title}</div>
            <div style={{ display: "grid", gap: 4 }}>
              {g.items.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Grid>
    </Card>
  );
}
