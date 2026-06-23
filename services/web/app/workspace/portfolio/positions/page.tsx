"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, JsonView, Meta, StatusBadge, TimeText, statusColor } from "@/components/ui";
import { fmtFull, fmtMoney, fmtNum, fmtPct } from "@/lib/format";

interface SignalCtx {
  conviction: string | null;
  targetPrice: number | null;
  stopLoss: number | null;
  thesis: string | null;
  expiresAt: string | null;
}

interface PositionRow {
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  targetWeight: number | null;
  targetNotional: number | null;
  entryPrice: number | null;
  shares: number | null;
  sectorAtEntry: string | null;
  sizingReasons: unknown;
  sizingParams: unknown;
  closedAt: string | null;
  exitPrice: number | null;
  realizedReturn: number | null;
  openedAt: string;
  signal: SignalCtx | null;
}

/** Position target weight (fraction of capital) → "3.0%". */
function fmtWeight(w: number | null): string {
  return w == null ? "—" : `${(w * 100).toFixed(1)}%`;
}

function dirColor(d: string) {
  return d === "buy" ? "#3fb950" : d === "sell" ? "#f85149" : "#9aa7bd";
}

/** realizedReturn is a fraction (0.05 = +5%); format only for closed rows. */
function fmtRealized(r: PositionRow) {
  if (r.status !== "closed" || r.realizedReturn == null) return "—";
  const pct = r.realizedReturn * 100;
  return <span style={{ color: pct >= 0 ? "#3fb950" : "#f85149" }}>{fmtPct(pct)}</span>;
}

const columns: Column<PositionRow>[] = [
  { key: "openedAt", header: "Opened", render: (r) => <TimeText ts={r.openedAt} />, width: 128 },
  { key: "symbol", header: "Symbol", render: (r) => <Link href={`/workspace/data/symbol/${r.symbol}/overall`}><Badge>{r.symbol}</Badge></Link> },
  { key: "direction", header: "Dir", render: (r) => <Badge color={dirColor(r.direction)}>{r.direction}</Badge> },
  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "targetWeight", header: "Weight", render: (r) => fmtWeight(r.targetWeight) },
  { key: "targetNotional", header: "Notional", render: (r) => fmtMoney(r.targetNotional) },
  { key: "entryPrice", header: "Entry", render: (r) => fmtMoney(r.entryPrice) },
  { key: "shares", header: "Shares", render: (r) => fmtNum(r.shares) },
  { key: "exitPrice", header: "Exit", render: (r) => fmtMoney(r.exitPrice) },
  { key: "realizedReturn", header: "Realized", render: (r) => fmtRealized(r) },
  { key: "sectorAtEntry", header: "Sector", render: (r) => (r.sectorAtEntry ? <Badge>{r.sectorAtEntry}</Badge> : "—") },
];

export default function PositionsPage() {
  return (
    <div>
      <PageTitle subsystem="portfolio" sub="Deterministic sizing on open → close via stop-loss / take-profit / expiry">
        Positions
      </PageTitle>
      <LiveTable
        path="/api/positions"
        rowKey={(r) => r.signalId}
        pageSize={50}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          { key: "status", label: "Status", options: ["open", "closed"].map((v) => ({ value: v, label: v })) },
        ]}
        expand={(r) => (
          <div style={{ display: "grid", gap: 10 }}>
            <Meta label="signal_id" value={r.signalId} />
            <Meta label="opened_at" value={fmtFull(r.openedAt)} />
            <Meta label="closed_at" value={r.closedAt ? fmtFull(r.closedAt) : "—"} />
            <Meta label="entry → exit" value={`${fmtMoney(r.entryPrice)} → ${fmtMoney(r.exitPrice)}`} />
            <Meta label="sector_at_entry" value={r.sectorAtEntry ?? "—"} />
            {r.signal && (
              <>
                <Meta label="conviction" value={r.signal.conviction ?? "—"} />
                <Meta
                  label="signal target / stop"
                  value={`${fmtMoney(r.signal.targetPrice)} / ${fmtMoney(r.signal.stopLoss)}`}
                />
                <Meta label="signal expires" value={r.signal.expiresAt ? fmtFull(r.signal.expiresAt) : "—"} />
              </>
            )}
            {r.status === "closed" && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <span>realized {fmtRealized(r)}</span>
                <Badge color={statusColor(r.status)}>{r.status}</Badge>
              </div>
            )}
            {r.signal?.thesis && (
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>signal thesis</div>
                <div style={{ fontSize: 13 }}>{r.signal.thesis}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>sizing reasons</div>
              <JsonView value={r.sizingReasons} />
            </div>
            <details>
              <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>sizing params (replay snapshot)</summary>
              <JsonView value={r.sizingParams} />
            </details>
          </div>
        )}
      />
    </div>
  );
}
