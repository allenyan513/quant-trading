"use client";

/** Discover → Economic calendar: upcoming High/Medium-impact macro events (FMP, via data). */
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import type { EconEventRow } from "@qt/shared/markets";

const fmtVal = (v: number | null, unit: string | null) => (v == null ? "—" : `${v}${unit ?? ""}`);

const columns: Column<EconEventRow>[] = [
  { key: "date", header: "Time", render: (r) => r.date.slice(0, 16), width: 132 },
  { key: "country", header: "Country", render: (r) => r.country ?? "—", width: 48 },
  { key: "event", header: "Event", render: (r) => <span style={{ fontSize: 13 }}>{r.event}</span> },
  { key: "impact", header: "Impact", render: (r) => <Badge color={r.impact === "High" ? "#f85149" : "#d29922"}>{r.impact}</Badge>, width: 72 },
  { key: "estimate", header: "Estimate", render: (r) => fmtVal(r.estimate, r.unit) },
  { key: "previous", header: "Previous", render: (r) => fmtVal(r.previous, r.unit) },
];

export default function EconomicPage() {
  return (
    <div>
      <PageTitle sub="Macro data calendar for the next two weeks (FMP, High / Medium impact, sorted by time)">Economic calendar</PageTitle>
      <LiveTable path="/api/markets/economic" rowKey={(r) => `${r.date}-${r.country ?? ""}-${r.event}`} columns={columns} pageSize={50} emptyText="No major economic data coming up." />
    </div>
  );
}
