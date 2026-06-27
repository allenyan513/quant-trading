"use client";

/** The morning-brief archive list (user-level; same content under any ledger). The
 *  `base` parameterizes the per-row detail links so it works under /live or /paper. */

import Link from "@/components/link";
import { LiveTable, type Column } from "@/components/live";
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

export function MorningBriefList({ base }: { base: string }) {
  const columns: Column<BriefRow>[] = [
    {
      key: "briefDate",
      header: "Date",
      render: (r) => (
        <Link href={`${base}/${r.briefDate}`} style={{ color: "#58a6ff", fontWeight: 600, textDecoration: "none" }}>
          {r.briefDate}
        </Link>
      ),
      width: 130,
    },
    { key: "dayPnl", header: "Day P&L", render: (r) => dayPnl(r.summary), width: 110 },
    { key: "createdAt", header: "Generated", render: (r) => <TimeText ts={r.createdAt} />, width: 150 },
  ];
  return (
    <LiveTable
      path="/api/morning-brief"
      rowKey={(r: BriefRow) => r.briefDate}
      columns={columns}
      emptyText="No briefs yet — run the morning-brief skill in a Claude connected to MCP to generate and archive one."
    />
  );
}
