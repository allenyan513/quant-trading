"use client";

/** Discover → 经济日历: upcoming High/Medium-impact macro events (FMP, via data). */
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import type { EconEventRow } from "@qt/shared/markets";

const fmtVal = (v: number | null, unit: string | null) => (v == null ? "—" : `${v}${unit ?? ""}`);

const columns: Column<EconEventRow>[] = [
  { key: "date", header: "时间", render: (r) => r.date.slice(0, 16), width: 132 },
  { key: "country", header: "国", render: (r) => r.country ?? "—", width: 48 },
  { key: "event", header: "事件", render: (r) => <span style={{ fontSize: 13 }}>{r.event}</span> },
  { key: "impact", header: "影响", render: (r) => <Badge color={r.impact === "High" ? "#f85149" : "#d29922"}>{r.impact}</Badge>, width: 72 },
  { key: "estimate", header: "预期", render: (r) => fmtVal(r.estimate, r.unit) },
  { key: "previous", header: "前值", render: (r) => fmtVal(r.previous, r.unit) },
];

export default function EconomicPage() {
  return (
    <div>
      <PageTitle sub="未来两周经济数据日历（FMP,High / Medium 影响,按时间排序）">经济日历</PageTitle>
      <LiveTable path="/api/markets/economic" rowKey={(r) => `${r.date}-${r.country ?? ""}-${r.event}`} columns={columns} pageSize={50} emptyText="近期无重要经济数据。" />
    </div>
  );
}
