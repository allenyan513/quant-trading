"use client";

import { useState } from "react";
import { mutate } from "swr";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, JsonView, Meta, StatusBadge, TimeText } from "@/components/ui";
import { fmtFull } from "@/lib/format";

/** Promote/dismiss buttons. Calls the web route (which forwards to ingestion),
 *  then revalidates the candidates table so the row updates immediately. */
function CandidateActions({ symbol, status }: { symbol: string; status: string }) {
  const [busy, setBusy] = useState(false);
  if (status !== "pending") return <span style={{ color: "var(--muted)" }}>—</span>;

  async function act(action: "promote" | "dismiss") {
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`${action} failed: ${j.error ?? res.status}`);
        return;
      }
      await mutate((k) => typeof k === "string" && k.startsWith("/api/candidates"));
    } finally {
      setBusy(false);
    }
  }

  const btn = (color: string): React.CSSProperties => ({
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 4,
    cursor: busy ? "default" : "pointer",
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    opacity: busy ? 0.5 : 1,
  });

  return (
    <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button disabled={busy} onClick={() => act("promote")} style={btn("#3fb950")}>Promote</button>
      <button disabled={busy} onClick={() => act("dismiss")} style={btn("#f85149")}>Dismiss</button>
    </span>
  );
}

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
  { key: "actions", header: "Actions", render: (r) => <CandidateActions symbol={r.symbol} status={r.status} /> },
];

export default function CandidatesPage() {
  return (
    <div>
      <PageTitle subsystem="ingestion" sub="选股发现 scanner → 人工 promote 进 watchlist">Candidates</PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Discovery review queue. Promote via{" "}
        <code>POST /candidates/promote {"{ symbol }"}</code> (ingestion) to add to the watchlist.
      </p>
      <LiveTable
        path="/api/candidates"
        rowKey={(r) => r.symbol}
        columns={columns}
        pageSize={50}
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
