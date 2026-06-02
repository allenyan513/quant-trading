"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, JsonView, Meta, StatusBadge, TimeText } from "@/components/ui";
import { fmtFull, fmtMoney, fmtPct } from "@/lib/format";

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
  { key: "createdAt", header: "Created", render: (r) => <TimeText ts={r.createdAt} />, width: 128 },
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
      <PageTitle subsystem="analysis">Valuations</PageTitle>
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
            <Meta label="as_of (price date)" value={r.asOf} />
            <Meta label="created_at" value={fmtFull(r.createdAt)} />
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
