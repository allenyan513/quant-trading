"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, JsonView, Meta, StatusBadge, TimeText } from "@/components/ui";
import { fmtFull } from "@/lib/format";

interface EventRow {
  id: string;
  symbol: string | null;
  eventType: string | null;
  headline: string | null;
  directionHint: string | null;
  deliveryStatus: string;
  deliveryAttempts: number;
  lastError: string | null;
  observedAt: string | null;
  ingestedAt: string;
  raw: unknown;
}

const columns: Column<EventRow>[] = [
  { key: "ingestedAt", header: "Ingested", render: (r) => <TimeText ts={r.ingestedAt} />, width: 128 },
  {
    key: "symbol",
    header: "Symbol",
    render: (r) => (r.symbol ? <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> : "—"),
  },
  { key: "eventType", header: "Type", render: (r) => (r.eventType ? <Badge>{r.eventType}</Badge> : "—") },
  { key: "headline", header: "Headline", render: (r) => r.headline ?? "—" },
  { key: "deliveryStatus", header: "Delivery", render: (r) => <StatusBadge status={r.deliveryStatus} /> },
  { key: "deliveryAttempts", header: "Tries", width: 50 },
];

export default function EventsPage() {
  return (
    <div>
      <PageTitle subsystem="data">Events</PageTitle>
      <LiveTable
        path="/api/events"
        rowKey={(r) => r.id}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
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
            <Meta label="observed_at" value={fmtFull(r.observedAt)} />
            <Meta label="ingested_at" value={fmtFull(r.ingestedAt)} />
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
