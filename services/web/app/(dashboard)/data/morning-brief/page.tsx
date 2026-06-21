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
    header: "Date",
    render: (r) => (
      <Link href={`/data/morning-brief/${r.briefDate}`} style={{ color: "#58a6ff", fontWeight: 600, textDecoration: "none" }}>
        {r.briefDate}
      </Link>
    ),
    width: 130,
  },
  { key: "dayPnl", header: "Day P&L", render: (r) => dayPnl(r.summary), width: 110 },
  { key: "createdAt", header: "Generated", render: (r) => <TimeText ts={r.createdAt} />, width: 150 },
];

export default function MorningBriefListPage() {
  return (
    <div>
      <PageTitle subsystem="data" sub="Archive of daily portfolio morning briefs your Claude generates and saves back via MCP">
        Morning Brief
      </PageTitle>
      <LiveTable
        path="/api/morning-brief"
        rowKey={(r: BriefRow) => r.briefDate}
        columns={columns}
        emptyText="No briefs yet — run the morning-brief skill in a Claude connected to MCP to generate and archive one."
      />
    </div>
  );
}
