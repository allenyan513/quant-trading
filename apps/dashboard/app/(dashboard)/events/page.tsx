"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge, JsonView, StatusBadge } from "@/components/ui";
import { fmtAgo } from "@/lib/format";

interface EventRow {
  id: string;
  symbol: string | null;
  eventType: string | null;
  headline: string | null;
  directionHint: string | null;
  status: string;
  deliveryStatus: string;
  deliveryAttempts: number;
  lastError: string | null;
  observedAt: string | null;
  ingestedAt: string;
  raw: unknown;
}

const columns: Column<EventRow>[] = [
  { key: "ingestedAt", header: "Ingested", render: (r) => fmtAgo(r.ingestedAt), width: 90 },
  {
    key: "symbol",
    header: "Symbol",
    render: (r) => (r.symbol ? <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> : "—"),
  },
  { key: "eventType", header: "Type", render: (r) => (r.eventType ? <Badge>{r.eventType}</Badge> : "—") },
  { key: "headline", header: "Headline", render: (r) => r.headline ?? "—" },
  { key: "status", header: "Pipeline", render: (r) => <StatusBadge status={r.status} /> },
  { key: "deliveryStatus", header: "Delivery", render: (r) => <StatusBadge status={r.deliveryStatus} /> },
  { key: "deliveryAttempts", header: "Tries", width: 50 },
];

export default function EventsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Events</h1>
      <LiveTable
        path="/api/events"
        rowKey={(r) => r.id}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          {
            key: "status",
            label: "Pipeline",
            options: ["pending", "processing", "done", "noise"].map((v) => ({ value: v, label: v })),
          },
          {
            key: "deliveryStatus",
            label: "Delivery",
            options: ["pending", "delivered", "failed"].map((v) => ({ value: v, label: v })),
          },
          { key: "eventType", label: "Event type" },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="id" value={r.id} />
            <Meta label="direction hint" value={r.directionHint ?? "—"} />
            <Meta label="observed_at" value={r.observedAt ?? "—"} />
            {r.lastError && <Meta label="last_error" value={r.lastError} error />}
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>raw payload</div>
              <JsonView value={r.raw} />
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function Meta({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13 }}>
      <span style={{ color: "var(--muted)", minWidth: 110 }}>{label}</span>
      <span style={{ color: error ? "#f85149" : undefined, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
