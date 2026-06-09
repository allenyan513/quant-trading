"use client";

/**
 * Financials tab — key quality metrics + multi-year trends for a long-term
 * holder (not a full 10-K dump). Reads the cached statement tables via
 * getFinancials and renders one row per metric: label · latest · YoY · inline
 * sparkline. Metrics align across statements by fiscalDate (income is the axis);
 * ratio fields fall back to raw-field formulas when absent. Annual, v1.
 */

import { Fragment } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card } from "@/components/ui";
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

type Kind = "money" | "pct" | "ratio" | "count";
interface Metric {
  label: string;
  kind: Kind;
  /** +1 = higher is better (green when rising), -1 = lower is better. */
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

// Strict last-two CHRONOLOGICAL periods (the series is oldest→newest). Don't
// drop nulls: YoY must compare consecutive years, and a missing latest year must
// read "—" rather than silently showing a stale earlier value. (div() below
// returns null when either point is null, so YoY just blanks out.)
function lastTwo(values: (number | null)[]): { latest: number | null; prev: number | null } {
  return {
    latest: values.at(-1) ?? null,
    prev: values.length >= 2 ? (values.at(-2) ?? null) : null,
  };
}

export default function FinancialsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Financials>(`/api/data/symbol/${symbol}/financials?period=annual&limit=8`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.income.length === 0)
    return <p style={{ color: "var(--muted)" }}>暂无财报缓存（该 symbol 的报表未预热）。</p>;

  const periods = data.income.map((r) => r.fiscalDate);
  const byDate = (rows: Row[]) => new Map(rows.map((r) => [r.fiscalDate, r.data]));
  const cf = byDate(data.cashflow);
  const bal = byDate(data.balance);
  const rat = byDate(data.ratios);

  const rows = METRICS.map((m) => {
    const series = data.income.map((r) =>
      m.fn(r.data, cf.get(r.fiscalDate) ?? {}, bal.get(r.fiscalDate) ?? {}, rat.get(r.fiscalDate) ?? {}),
    );
    const { latest, prev } = lastTwo(series);
    const yoy = div(latest != null && prev != null ? latest - prev : null, prev != null ? Math.abs(prev) : null);
    const improving = yoy == null ? null : yoy >= 0 === m.better > 0;
    return { m, series, latest, yoy, improving };
  });

  const range = periods.length ? `${periods[0]?.slice(0, 4)}–${periods.at(-1)?.slice(0, 4)}` : "";

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
        {rows.map(({ m, series, latest, yoy, improving }) => (
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
