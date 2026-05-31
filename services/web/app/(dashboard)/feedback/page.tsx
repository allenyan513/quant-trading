"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge, JsonView, Meta, TimeText } from "@/components/ui";
import { fmtFull } from "@/lib/format";

interface FeedbackRow {
  id: string;
  signalId: string | null;
  symbol: string | null;
  eventType: string | null;
  lesson: string;
  scores: unknown;
  createdAt: string;
}

const columns: Column<FeedbackRow>[] = [
  { key: "createdAt", header: "Created", render: (r) => <TimeText ts={r.createdAt} />, width: 128 },
  {
    key: "symbol",
    header: "Symbol",
    render: (r) => (r.symbol ? <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> : "—"),
  },
  { key: "eventType", header: "Type", render: (r) => (r.eventType ? <Badge>{r.eventType}</Badge> : "—") },
  { key: "lesson", header: "Lesson", render: (r) => r.lesson },
];

export default function FeedbackPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Feedback / lessons</h1>
      <LiveTable
        path="/api/feedback"
        rowKey={(r) => r.id}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          { key: "eventType", label: "Event type" },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="id" value={r.id} />
            <Meta label="signal_id" value={r.signalId ?? "—"} />
            <Meta label="created_at" value={fmtFull(r.createdAt)} />
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>scores</div>
              <JsonView value={r.scores} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
