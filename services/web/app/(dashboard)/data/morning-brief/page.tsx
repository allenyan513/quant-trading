"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { TimeText } from "@/components/ui";

interface BriefRow {
  briefDate: string;
  summary: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function dayPnl(summary: Record<string, unknown> | null) {
  const v = summary?.dayPnlPct;
  if (typeof v !== "number") return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <span style={{ color: v >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(2)}%
    </span>
  );
}

const columns: Column<BriefRow>[] = [
  {
    key: "briefDate",
    header: "日期",
    render: (r) => (
      <Link href={`/data/morning-brief/${r.briefDate}`} style={{ color: "#58a6ff", fontWeight: 600, textDecoration: "none" }}>
        {r.briefDate}
      </Link>
    ),
    width: 130,
  },
  { key: "dayPnl", header: "当日 P&L", render: (r) => dayPnl(r.summary), width: 110 },
  { key: "createdAt", header: "生成时间", render: (r) => <TimeText ts={r.createdAt} />, width: 150 },
];

export default function MorningBriefListPage() {
  return (
    <div>
      <PageTitle subsystem="data" sub="你的 Claude 经 MCP 生成、回存的每日持仓早报存档">
        Morning Brief
      </PageTitle>
      <LiveTable
        path="/api/morning-brief"
        rowKey={(r: BriefRow) => r.briefDate}
        columns={columns}
        emptyText="还没有早报 —— 在连了 MCP 的 Claude 里运行 morning-brief skill 即可生成并存档。"
      />
    </div>
  );
}
