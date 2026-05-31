"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge, JsonView, Meta, StatusBadge } from "@/components/ui";
import { fmtAgo } from "@/lib/format";

interface NotifRow {
  id: string;
  symbol: string;
  eventType: string;
  summary: string | null;
  count: number;
  eventIds: unknown;
  status: string;
  deliveryStatus: string;
  deliveryAttempts: number;
  lastError: string | null;
  ingestedAt: string;
}

const columns: Column<NotifRow>[] = [
  { key: "ingestedAt", header: "Bundled", render: (r) => fmtAgo(r.ingestedAt), width: 90 },
  {
    key: "symbol",
    header: "Symbol",
    render: (r) => <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link>,
  },
  { key: "eventType", header: "Type", render: (r) => <Badge>{r.eventType}</Badge> },
  { key: "summary", header: "Summary", render: (r) => r.summary ?? "—" },
  { key: "count", header: "Events", width: 60 },
  { key: "status", header: "Pipeline", render: (r) => <StatusBadge status={r.status} /> },
  { key: "deliveryStatus", header: "Delivery", render: (r) => <StatusBadge status={r.deliveryStatus} /> },
];

export default function NotificationsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Notifications</h1>
      <LiveTable
        path="/api/notifications"
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
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="id" value={r.id} />
            {r.lastError && <Meta label="last_error" value={r.lastError} error />}
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>member event ids</div>
              <JsonView value={r.eventIds} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
