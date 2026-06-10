"use client";

/**
 * Financials tab — the deep-fundamentals hub for a long-term holder:
 *   1. Quality scorecard: a few "is this a good business" signals from the trend.
 *   2. Trend overview: key metrics with latest · YoY · sparkline.
 *   3. Full statements: income (with forward analyst estimates merged as future
 *      columns) / balance / cash flow, line-items × years.
 *   4. Grouped ratios (latest): valuation / profitability / health / per-share.
 *   5. Peer comparison: subject vs the valuation snapshot's comparables.
 * Statements/ratios from getFinancials; peers from the latest valuation snapshot.
 * FMP only forecasts revenue + EPS, so only those two income rows get estimates.
 */

import { Fragment } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, Grid, Badge } from "@/components/ui";
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
  estimates?: Row[];
}

const num = (d: Rec, k: string): number | null => {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const div = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b !== 0 ? a / b : null;
const add = (a: number | null, b: number | null): number | null => (a != null && b != null ? a + b : null);

// ---------- 2. Trend overview ----------
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
  return { latest: values.at(-1) ?? null, prev: values.length >= 2 ? (values.at(-2) ?? null) : null };
}

// ---------- 3. Statement line-item configs (raw FMP fields) ----------
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
// FMP analyst-estimates only forecasts revenue + EPS — map those income rows to
// the estimate fields; all other rows stay blank in forecast columns.
const INCOME_ESTIMATE_MAP: Record<string, string> = { revenue: "revenueAvg", epsDiluted: "epsAvg" };

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

// ---------- 5. Peer comparison ----------
interface Peer {
  ticker: string;
  name?: string;
  market_cap?: number | null;
  trailing_pe?: number | null;
  ev_ebitda?: number | null;
  revenue_growth?: number | null;
  net_margin?: number | null;
  roe?: number | null;
}
interface Snapshot {
  detail?: { models?: { model_type: string; details?: { peers?: Peer[] } }[] } | null;
}

export default function FinancialsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Financials>(`/api/data/symbol/${symbol}/financials?period=annual&limit=8`);
  const { data: snap } = useLive<Snapshot | null>(`/api/data/valuation/${symbol}`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.income.length === 0)
    return <p style={{ color: "var(--muted)" }}>暂无财报缓存（点头部「⟳ 刷新数据」预热该 symbol）。</p>;

  const byDate = (rows: Row[]) => new Map(rows.map((r) => [r.fiscalDate, r.data]));
  const cf = byDate(data.cashflow);
  const bal = byDate(data.balance);
  const rat = byDate(data.ratios);

  const series = (m: Metric) =>
    data.income.map((r) => m.fn(r.data, cf.get(r.fiscalDate) ?? {}, bal.get(r.fiscalDate) ?? {}, rat.get(r.fiscalDate) ?? {}));

  const trend = METRICS.map((m) => {
    const sx = series(m);
    const { latest, prev } = lastTwo(sx);
    const yoy = div(latest != null && prev != null ? latest - prev : null, prev != null ? Math.abs(prev) : null);
    const improving = yoy == null ? null : yoy >= 0 === m.better > 0;
    return { m, series: sx, latest, yoy, improving };
  });

  const periods = data.income.map((r) => r.fiscalDate);
  const range = periods.length ? `${periods[0]?.slice(0, 4)}–${periods.at(-1)?.slice(0, 4)}` : "";
  const peers = snap?.detail?.models?.find((m) => Array.isArray(m.details?.peers) && m.details!.peers!.length)?.details?.peers ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Scorecard income={data.income} cashflow={data.cashflow} balance={data.balance} ratios={data.ratios} />
      <TrendOverview trend={trend} range={range} />
      <RatioGroups income={data.income} balance={data.balance} cashflow={data.cashflow} ratios={data.ratios} />
      <StatementTable title="利润表 Income Statement" rows={data.income} lines={INCOME_LINES} estimates={data.estimates ?? []} estimateMap={INCOME_ESTIMATE_MAP} />
      <StatementTable title="资产负债表 Balance Sheet" rows={data.balance} lines={BALANCE_LINES} />
      <StatementTable title="现金流量表 Cash Flow" rows={data.cashflow} lines={CASHFLOW_LINES} />
      <PeerCompare symbol={symbol} peers={peers} income={data.income} balance={data.balance} />
    </div>
  );
}

// ---------- render: quality scorecard ----------
type Verdict = "good" | "ok" | "weak";
const V_COLOR: Record<Verdict, string> = { good: "#3fb950", ok: "#d29922", weak: "#f85149" };
function Scorecard({ income, cashflow, balance, ratios }: { income: Row[]; cashflow: Row[]; balance: Row[]; ratios: Row[] }) {
  const byDate = (rows: Row[]) => new Map(rows.map((r) => [r.fiscalDate, r.data]));
  const cf = byDate(cashflow);
  const bal = byDate(balance);
  const rat = byDate(ratios);
  const li = income.at(-1)?.data ?? {};
  const lastDate = income.at(-1)?.fiscalDate ?? "";
  const lb = bal.get(lastDate) ?? {};
  const lr = rat.get(lastDate) ?? {};

  const revs = income.map((r) => num(r.data, "revenue")).filter((v): v is number => v != null && v > 0);
  const yrs = income.length - 1;
  const revCagr = revs.length >= 2 && yrs > 0 ? Math.pow(revs.at(-1)! / revs[0]!, 1 / yrs) - 1 : null;
  const fcfYears = income.map((r) => num(cf.get(r.fiscalDate) ?? {}, "freeCashFlow") ?? add(num(cf.get(r.fiscalDate) ?? {}, "operatingCashFlow"), num(cf.get(r.fiscalDate) ?? {}, "capitalExpenditure")));
  const fcfPos = fcfYears.filter((v) => v != null && v > 0).length;
  const fcfTotal = fcfYears.filter((v) => v != null).length;
  const netMargin = num(lr, "netProfitMargin") ?? div(num(li, "netIncome"), num(li, "revenue"));
  const roe = num(lr, "returnOnEquity") ?? div(num(li, "netIncome"), num(lb, "totalStockholdersEquity"));
  const grossMargin = num(lr, "grossProfitMargin") ?? div(num(li, "grossProfit"), num(li, "revenue"));
  const netDebtEbitda = div(num(lb, "netDebt"), num(li, "ebitda"));
  const shares = income.map((r) => num(r.data, "weightedAverageShsOutDil")).filter((v): v is number => v != null && v > 0);
  const dilution = shares.length >= 2 && yrs > 0 ? Math.pow(shares.at(-1)! / shares[0]!, 1 / yrs) - 1 : null;

  const band = (v: number | null, g: number, o: number, higher = true): Verdict | null => {
    if (v == null) return null;
    if (higher) return v >= g ? "good" : v >= o ? "ok" : "weak";
    return v <= g ? "good" : v <= o ? "ok" : "weak";
  };

  const items: { label: string; value: string; verdict: Verdict | null }[] = [
    { label: "营收 CAGR", value: revCagr == null ? "—" : fmtPct(revCagr * 100), verdict: band(revCagr, 0.1, 0.03) },
    { label: "毛利率", value: grossMargin == null ? "—" : formatRatio(grossMargin), verdict: band(grossMargin, 0.4, 0.2) },
    { label: "净利率", value: netMargin == null ? "—" : formatRatio(netMargin), verdict: band(netMargin, 0.15, 0.05) },
    { label: "ROE", value: roe == null ? "—" : formatRatio(roe), verdict: band(roe, 0.15, 0.08) },
    { label: "FCF 为正", value: fcfTotal ? `${fcfPos}/${fcfTotal} 年` : "—", verdict: fcfTotal ? band(fcfPos / fcfTotal, 0.99, 0.6) : null },
    { label: "NetDebt/EBITDA", value: netDebtEbitda == null ? "—" : `${netDebtEbitda.toFixed(1)}x`, verdict: band(netDebtEbitda, 1, 3, false) },
    { label: "股本稀释/年", value: dilution == null ? "—" : fmtPct(dilution * 100), verdict: band(dilution, 0, 0.03, false) },
  ];
  const score = items.filter((i) => i.verdict === "good").length;
  const rated = items.filter((i) => i.verdict != null).length;

  return (
    <Card title={`质量评分卡${rated ? ` · ${score}/${rated} 项优` : ""}`}>
      <Grid min={150}>
        {items.map((it) => (
          <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{it.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "ui-monospace, Menlo, monospace" }}>{it.value}</span>
              {it.verdict && <Badge color={V_COLOR[it.verdict]}>{it.verdict}</Badge>}
            </span>
          </div>
        ))}
      </Grid>
    </Card>
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

// ---------- render: statement table (with optional forward estimates) ----------
function StatementTable({
  title,
  rows,
  lines,
  estimates = [],
  estimateMap = {},
}: {
  title: string;
  rows: Row[];
  lines: Line[];
  estimates?: Row[];
  estimateMap?: Record<string, string>;
}) {
  if (rows.length === 0) return null;
  const lastActual = rows.at(-1)?.fiscalDate ?? "";
  const estCols = estimates.filter((e) => e.fiscalDate > lastActual).slice(0, 3);
  const thBase: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, whiteSpace: "nowrap" };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
  const stick: React.CSSProperties = { position: "sticky", left: 0, background: "var(--panel)" };
  return (
    <Card title={title}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: "left", ...stick }}>Line item</th>
              {rows.map((r) => (
                <th key={r.fiscalDate} style={{ ...thBase, textAlign: "right" }}>{r.fiscalDate.slice(0, 4)}</th>
              ))}
              {estCols.map((e) => (
                <th key={e.fiscalDate} style={{ ...thBase, textAlign: "right", color: "#a371f7" }}>{e.fiscalDate.slice(0, 4)}E</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => {
              const estKey = estimateMap[ln.field];
              return (
                <tr key={ln.label}>
                  <td style={{ ...td, textAlign: "left", color: "var(--muted)", ...stick }}>{ln.label}</td>
                  {rows.map((r) => (
                    <td key={r.fiscalDate} style={{ ...td, ...mono }}>{fmtLine(ln.kind, num(r.data, ln.field))}</td>
                  ))}
                  {estCols.map((e) => (
                    <td key={e.fiscalDate} style={{ ...td, ...mono, color: estKey ? "#a371f7" : "var(--muted)" }}>
                      {estKey ? fmtLine(ln.kind, num(e.data, estKey)) : "·"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {estCols.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          <span style={{ color: "#a371f7" }}>E</span> = 分析师一致预期（FMP 仅预测营收与 EPS）
        </div>
      )}
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
    { title: "估值", items: [["P/E", ratioX(num(lr, "priceToEarningsRatio"))], ["P/S", ratioX(num(lr, "priceToSalesRatio"))], ["P/B", ratioX(num(lr, "priceToBookRatio"))], ["EV/EBITDA", ratioX(num(lr, "enterpriseValueMultiple"))]] },
    { title: "盈利", items: [["毛利率", pct(div(num(li, "grossProfit"), num(li, "revenue")))], ["营业利润率", pct(div(num(li, "operatingIncome"), num(li, "revenue")))], ["净利率", pct(div(num(li, "netIncome"), num(li, "revenue")))], ["ROE", pct(div(num(li, "netIncome"), num(lb, "totalStockholdersEquity")))], ["ROA", pct(div(num(li, "netIncome"), num(lb, "totalAssets")))]] },
    { title: "财务健康", items: [["Debt/Equity", ratioX(div(num(lb, "totalDebt"), num(lb, "totalStockholdersEquity")))], ["NetDebt/EBITDA", ratioX(div(num(lb, "netDebt"), num(li, "ebitda")))], ["利息覆盖", ratioX(div(num(li, "operatingIncome"), num(li, "interestExpense")))]] },
    { title: "每股", items: [["EPS (摊薄)", usd(num(li, "epsDiluted"))], ["FCF/股", usd(div(fcf, shares))], ["每股净资产", usd(div(num(lb, "totalStockholdersEquity"), shares))]] },
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

// ---------- render: peer comparison ----------
function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
function PeerCompare({ symbol, peers, income, balance }: { symbol: string; peers: Peer[]; income: Row[]; balance: Row[] }) {
  if (!peers.length) return null;
  // Subject's comparable metrics derived from its own statements (PE/EV-EBITDA
  // need market data we don't have here, so left blank for the subject row).
  const li = income.at(-1)?.data ?? {};
  const lb = balance.at(-1)?.data ?? {};
  const revs = income.map((r) => num(r.data, "revenue")).filter((v): v is number => v != null);
  const subjGrowth = revs.length >= 2 ? div(revs.at(-1)! - revs.at(-2)!, Math.abs(revs.at(-2)!)) : null;
  const subj: Peer = {
    ticker: symbol,
    market_cap: null,
    trailing_pe: null,
    ev_ebitda: null,
    revenue_growth: subjGrowth,
    net_margin: div(num(li, "netIncome"), num(li, "revenue")),
    roe: div(num(li, "netIncome"), num(lb, "totalStockholdersEquity")),
  };
  const med: Peer = {
    ticker: "中位数",
    market_cap: median(peers.map((p) => p.market_cap)),
    trailing_pe: median(peers.map((p) => p.trailing_pe)),
    ev_ebitda: median(peers.map((p) => p.ev_ebitda)),
    revenue_growth: median(peers.map((p) => p.revenue_growth)),
    net_margin: median(peers.map((p) => p.net_margin)),
    roe: median(peers.map((p) => p.roe)),
  };
  const cap = (v?: number | null) => (v == null ? "—" : formatLargeNumber(v));
  const x = (v?: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
  const pc = (v?: number | null) => (v == null ? "—" : formatRatio(v));
  const cols: { h: string; f: (p: Peer) => string }[] = [
    { h: "Mkt Cap", f: (p) => cap(p.market_cap) },
    { h: "P/E", f: (p) => x(p.trailing_pe) },
    { h: "EV/EBITDA", f: (p) => x(p.ev_ebitda) },
    { h: "营收增速", f: (p) => pc(p.revenue_growth) },
    { h: "净利率", f: (p) => pc(p.net_margin) },
    { h: "ROE", f: (p) => pc(p.roe) },
  ];
  const th: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap", fontFamily: "ui-monospace, Menlo, monospace" };
  const renderRow = (p: Peer, emphasis?: "subject" | "median") => (
    <tr key={p.ticker} style={emphasis === "subject" ? { background: "rgba(88,166,255,0.08)" } : undefined}>
      <td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: emphasis ? 700 : 400, color: emphasis === "median" ? "var(--muted)" : "var(--text)" }}>
        {p.ticker}
        {p.name && emphasis !== "median" && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {p.name}</span>}
      </td>
      {cols.map((c) => (<td key={c.h} style={td}>{c.f(p)}</td>))}
    </tr>
  );
  return (
    <Card title="同业对比 · 来自估值快照的可比公司">
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "var(--panel)" }}>公司</th>
              {cols.map((c) => (<th key={c.h} style={{ ...th, textAlign: "right" }}>{c.h}</th>))}
            </tr>
          </thead>
          <tbody>
            {renderRow(subj, "subject")}
            {peers.map((p) => renderRow(p))}
            {renderRow(med, "median")}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>本票 P/E、EV/EBITDA 需市场数据，未在此计算（见 Valuation tab）。</div>
    </Card>
  );
}
