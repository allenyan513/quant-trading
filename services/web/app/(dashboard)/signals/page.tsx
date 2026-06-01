"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge, Meta, StatusBadge, TimeText, statusColor } from "@/components/ui";
import { fmtFull, fmtMoney, fmtPct } from "@/lib/format";

interface Position {
  status: string;
  targetWeight: number | null;
  targetNotional: number | null;
  exitPrice: number | null;
  realizedReturn: number | null;
  sizingReasons: unknown;
}
interface SignalRow {
  id: string;
  symbol: string;
  direction: string;
  conviction: string | null;
  targetPrice: number | null;
  stopLoss: number | null;
  entryPrice: number | null;
  fairValueBase: number | null;
  deviationPct: number | null;
  thesis: string | null;
  generatedBy: string | null;
  snapshotId: string | null;
  notificationId: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  position: Position | null;
  delivery: { deliveryStatus: string; attempts: number; lastError: string | null } | null;
}

/** Position target weight (fraction of capital) → "3.0%". */
function fmtWeight(w: number | null): string {
  return w == null ? "—" : `${(w * 100).toFixed(1)}%`;
}

function dirColor(d: string) {
  return d === "buy" ? "#3fb950" : d === "sell" ? "#f85149" : "#9aa7bd";
}

const columns: Column<SignalRow>[] = [
  { key: "createdAt", header: "Created", render: (r) => <TimeText ts={r.createdAt} />, width: 128 },
  { key: "symbol", header: "Symbol", render: (r) => <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> },
  { key: "direction", header: "Dir", render: (r) => <Badge color={dirColor(r.direction)}>{r.direction}</Badge> },
  { key: "conviction", header: "Conv", render: (r) => (r.conviction ? <Badge>{r.conviction}</Badge> : "—") },
  { key: "entryPrice", header: "Entry", render: (r) => fmtMoney(r.entryPrice) },
  { key: "targetPrice", header: "Target", render: (r) => fmtMoney(r.targetPrice) },
  { key: "stopLoss", header: "Stop", render: (r) => fmtMoney(r.stopLoss) },
  {
    key: "deviationPct",
    header: "Dev",
    render: (r) => (
      <span style={{ color: r.deviationPct == null ? undefined : r.deviationPct >= 0 ? "#3fb950" : "#f85149" }}>
        {fmtPct(r.deviationPct)}
      </span>
    ),
  },
  { key: "generatedBy", header: "By", render: (r) => (r.generatedBy ? <Badge>{r.generatedBy}</Badge> : "—") },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  {
    key: "position",
    header: "Pos",
    render: (r) =>
      r.position ? (
        <span style={{ fontSize: 12 }}>
          {fmtWeight(r.position.targetWeight)} <Badge color={statusColor(r.position.status)}>{r.position.status}</Badge>
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "delivery",
    header: "Delivery",
    render: (r) => <StatusBadge status={r.delivery?.deliveryStatus} />,
  },
];

export default function SignalsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signals</h1>
      <LiveTable
        path="/api/signals"
        rowKey={(r) => r.id}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          {
            key: "status",
            label: "Status",
            options: ["open", "target_hit", "stopped_out", "expired", "closed"].map((v) => ({ value: v, label: v })),
          },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="id" value={r.id} />
            <Meta label="notification_id" value={r.notificationId ?? "—"} />
            <Meta label="snapshot_id" value={r.snapshotId ?? "—"} />
            <Meta label="fair_value_base" value={fmtMoney(r.fairValueBase)} />
            <Meta label="created_at" value={fmtFull(r.createdAt)} />
            <Meta label="expires_at" value={fmtFull(r.expiresAt)} />
            {r.delivery?.lastError && <Meta label="delivery error" value={r.delivery.lastError} error />}
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>thesis</div>
              <div style={{ fontSize: 13 }}>{r.thesis ?? "—"}</div>
            </div>
            {r.position && (
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>position</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                  <span>weight {fmtWeight(r.position.targetWeight)}</span>
                  <span>notional {fmtMoney(r.position.targetNotional)}</span>
                  <Badge color={statusColor(r.position.status)}>{r.position.status}</Badge>
                  {r.position.status === "closed" && (
                    <>
                      <span>exit {fmtMoney(r.position.exitPrice)}</span>
                      <span>realized {fmtPct(r.position.realizedReturn == null ? null : r.position.realizedReturn * 100)}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
