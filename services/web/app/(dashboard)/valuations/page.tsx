"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Meta } from "../events/page";
import { Badge, JsonView, StatusBadge } from "@/components/ui";
import { fmtAgo, fmtMoney, fmtPct } from "@/lib/format";

interface ValRow {
  snapshotId: string;
  symbol: string;
  asOf: string;
  fairValuePerShare: number | null;
  currentPrice: number | null;
  upsidePct: number | null;
  verdict: string | null;
  codeVersion: string;
  detail: unknown;
  createdAt: string;
}

const columns: Column<ValRow>[] = [
  { key: "createdAt", header: "Created", render: (r) => fmtAgo(r.createdAt), width: 90 },
  { key: "symbol", header: "Symbol", render: (r) => <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> },
  { key: "fairValuePerShare", header: "Fair value", render: (r) => fmtMoney(r.fairValuePerShare) },
  { key: "currentPrice", header: "Price", render: (r) => fmtMoney(r.currentPrice) },
  {
    key: "upsidePct",
    header: "Upside",
    render: (r) => (
      <span style={{ color: r.upsidePct == null ? undefined : r.upsidePct >= 0 ? "#3fb950" : "#f85149" }}>
        {fmtPct(r.upsidePct)}
      </span>
    ),
  },
  { key: "verdict", header: "Verdict", render: (r) => <StatusBadge status={r.verdict} /> },
  { key: "codeVersion", header: "Code ver", render: (r) => <span style={{ color: "var(--muted)" }}>{r.codeVersion}</span> },
];

export default function ValuationsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Valuations</h1>
      <LiveTable
        path="/api/valuations"
        rowKey={(r) => r.snapshotId}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          {
            key: "verdict",
            label: "Verdict",
            options: ["undervalued", "fairly_valued", "overvalued"].map((v) => ({ value: v, label: v })),
          },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="snapshot_id" value={r.snapshotId} />
            <Meta label="as_of" value={r.asOf} />
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>per-model detail</div>
              <JsonView value={r.detail} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
