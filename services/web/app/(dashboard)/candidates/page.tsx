"use client";

import { LiveTable, type Column } from "@/components/live";
import { Badge, JsonView, Meta, StatusBadge, TimeText } from "@/components/ui";
import { fmtFull } from "@/lib/format";

interface CandidateRow {
  symbol: string;
  source: string;
  discoveryReason: string | null;
  score: number | null;
  detail: unknown;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

const columns: Column<CandidateRow>[] = [
  { key: "lastSeenAt", header: "Last seen", render: (r) => <TimeText ts={r.lastSeenAt} />, width: 128 },
  { key: "symbol", header: "Symbol", render: (r) => <Badge>{r.symbol}</Badge> },
  { key: "source", header: "Source", render: (r) => <Badge>{r.source}</Badge> },
  { key: "score", header: "Score", render: (r) => (r.score == null ? "—" : r.score.toFixed(3)) },
  { key: "discoveryReason", header: "Reason", render: (r) => <span style={{ fontSize: 13 }}>{r.discoveryReason ?? "—"}</span> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

export default function CandidatesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Candidates</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Discovery review queue. Promote via{" "}
        <code>POST /candidates/promote {"{ symbol }"}</code> (ingestion) to add to the watchlist.
      </p>
      <LiveTable
        path="/api/candidates"
        rowKey={(r) => r.symbol}
        columns={columns}
        emptyText="No candidates — run POST /scan/earnings."
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["pending", "promoted", "dismissed"].map((v) => ({ value: v, label: v })),
          },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="symbol" value={r.symbol} />
            <Meta label="reason" value={r.discoveryReason ?? "—"} />
            <Meta label="first_seen" value={fmtFull(r.firstSeenAt)} />
            <Meta label="last_seen" value={fmtFull(r.lastSeenAt)} />
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>scan detail</div>
              <JsonView value={r.detail} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
