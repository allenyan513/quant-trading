"use client";

/** Discover → 财报日历: upcoming analyst-covered earnings (FMP, forwarded by data). */
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import { formatLargeNumber } from "@/lib/format";
import type { EarningsRow } from "@qt/shared/markets";

const columns: Column<EarningsRow>[] = [
  { key: "date", header: "日期", render: (r) => r.date, width: 110 },
  { key: "symbol", header: "Symbol", render: (r) => <Badge>{r.symbol}</Badge> },
  { key: "epsEstimated", header: "EPS 预期", render: (r) => (r.epsEstimated == null ? "—" : r.epsEstimated.toFixed(2)) },
  { key: "revenueEstimated", header: "营收预期", render: (r) => (r.revenueEstimated == null ? "—" : formatLargeNumber(r.revenueEstimated)) },
];

export default function EarningsPage() {
  return (
    <div>
      <PageTitle sub="未来两周财报日历（FMP,仅含分析师覆盖的公司,按日期排序）">财报日历</PageTitle>
      <LiveTable path="/api/markets/earnings" rowKey={(r) => `${r.symbol}-${r.date}`} columns={columns} pageSize={50} emptyText="近期无财报。" />
    </div>
  );
}
