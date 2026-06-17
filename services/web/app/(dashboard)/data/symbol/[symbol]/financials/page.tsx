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
 *
 * The render sections + their shared helpers/configs live under ./sections.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import {
  type Financials,
  type Metric,
  type Snapshot,
  num,
  div,
  byDate,
  lastTwo,
  METRICS,
  INCOME_LINES,
  INCOME_ESTIMATE_MAP,
  BALANCE_LINES,
  CASHFLOW_LINES,
} from "./sections/shared";
import { Scorecard } from "./sections/scorecard";
import { ForwardEstimates } from "./sections/forward-estimates";
import { TrendOverview } from "./sections/trend-overview";
import { PeriodToggle } from "./sections/period-toggle";
import { StatementTable } from "./sections/statement-table";
import { RatioGroups } from "./sections/ratio-groups";
import { PeerCompare } from "./sections/peer-compare";

export default function FinancialsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  // Annual feeds the inherently-annual analytics (quality CAGR / forward
  // estimates / ratios / peers); a separate period-driven fetch feeds the full
  // statement tables. When period="annual" both URLs match → SWR dedupes.
  const [period, setPeriod] = useState<"annual" | "quarter">("annual");
  const { data, error } = useLive<Financials>(`/api/data/symbol/${symbol}/financials?period=annual&limit=8`);
  const { data: stmt } = useLive<Financials>(
    `/api/data/symbol/${symbol}/financials?period=${period}&limit=${period === "quarter" ? 12 : 8}`,
  );
  const { data: snap } = useLive<Snapshot | null>(`/api/data/valuation/${symbol}`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.income.length === 0)
    return <p style={{ color: "var(--muted)" }}>暂无财报缓存（点头部「⟳ 刷新数据」预热该 symbol）。</p>;

  const stmtData = stmt ?? data;
  const stmtEmpty = period === "quarter" && stmtData.income.length === 0;

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
      <ForwardEstimates income={data.income} estimates={data.estimates ?? []} />
      <TrendOverview trend={trend} range={range} />
      <RatioGroups income={data.income} balance={data.balance} cashflow={data.cashflow} ratios={data.ratios} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>完整财务三表</span>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>
      {stmtEmpty ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>暂无季报缓存（点头部「⟳ 刷新数据」预热；或该标的为非美股报送人）。</p>
      ) : (
        <>
          <StatementTable title="利润表 Income Statement" rows={stmtData.income} lines={INCOME_LINES} period={period} estimates={period === "annual" ? (data.estimates ?? []) : []} estimateMap={INCOME_ESTIMATE_MAP} />
          <StatementTable title="资产负债表 Balance Sheet" rows={stmtData.balance} lines={BALANCE_LINES} period={period} />
          <StatementTable title="现金流量表 Cash Flow" rows={stmtData.cashflow} lines={CASHFLOW_LINES} period={period} note={period === "quarter" ? "季度现金流多数公司按 YTD 申报，目前仅财年 Q1 有值（SEC EDGAR 限制，见 #98）。" : undefined} />
        </>
      )}
      <PeerCompare symbol={symbol} peers={peers} income={data.income} balance={data.balance} />
    </div>
  );
}
