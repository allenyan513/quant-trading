"use client";

/**
 * Account KPI strip — the simplified "Performance" surface, one horizontal row of
 * core metrics per ledger (IBKR-style top bar). Same strip layout for all three;
 * only the metric set + data source differ. The deeper NAV-vs-SPY chart lives in
 * the Live secondary "Performance" view.
 */

import { useLive } from "@/components/live";
import { usePaperAccount } from "@/components/paper-ledger";
import { fmtMoney, fmtPct, fmtNum } from "@/lib/format";
import type { Ledger } from "@/components/portfolio/ledgers";

const GREEN = "#3fb950";
const RED = "#f85149";
const pnl = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? GREEN : RED);

interface Metric {
  label: string;
  value: string;
  color?: string;
}

function Strip({ metrics }: { metrics: Metric[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 1, border: "1px solid var(--border)", background: "var(--border)", marginBottom: 12 }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ background: "var(--panel)", padding: "8px 16px", minWidth: 120, flex: "0 0 auto" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{m.label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: m.color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}

export function LedgerMetrics({ ledger }: { ledger: Ledger }) {
  if (ledger === "paper") return <PaperMetrics />;
  if (ledger === "strategy") return <StrategyMetrics />;
  return <LiveMetrics />;
}

function PaperMetrics() {
  const { acct, cash, posValue, unrealized, equity, positions } = usePaperAccount();
  return (
    <Strip
      metrics={[
        { label: "Cash / buying power", value: fmtMoney(cash) },
        { label: "Positions value", value: fmtMoney(posValue) },
        { label: "Unrealized P&L", value: fmtMoney(unrealized), color: pnl(positions.length ? unrealized : null) },
        { label: "Realized P&L", value: fmtMoney(acct?.realizedPnl ?? 0), color: pnl(acct?.realizedPnl ?? null) },
        { label: "Total equity", value: fmtMoney(equity) },
      ]}
    />
  );
}

interface LivePos {
  assetClass: string;
  quantity: number;
  avgPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
}
function LiveMetrics() {
  const { data: nav } = useLive<{ endingNav: number | null; navIndex: number | null }>("/api/holdings/nav");
  const { data: pos } = useLive<{ positions: LivePos[] }>("/api/holdings/positions");
  const rows = (pos?.positions ?? []).filter((p) => p.assetClass !== "CASH");
  const posValue = rows.reduce((s, p) => s + (p.positionValue ?? 0), 0);
  const unrealized = rows.reduce((s, p) => s + ((p.markPrice ?? 0) - (p.avgPrice ?? 0)) * p.quantity, 0);
  return (
    <Strip
      metrics={[
        { label: "Net liquidity", value: fmtMoney(nav?.endingNav ?? null) },
        { label: "Positions value", value: fmtMoney(posValue) },
        { label: "Unrealized P&L", value: fmtMoney(unrealized), color: pnl(rows.length ? unrealized : null) },
        { label: "Positions", value: fmtNum(rows.length, 0) },
        { label: "NAV index", value: nav?.navIndex == null ? "—" : nav.navIndex.toFixed(1) },
      ]}
    />
  );
}

interface StratPos {
  status: string;
  targetNotional: number | null;
  realizedReturn: number | null;
}
function StrategyMetrics() {
  const { data } = useLive<StratPos[]>("/api/positions?limit=500");
  const rows = data ?? [];
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status === "closed");
  const notional = open.reduce((s, r) => s + (r.targetNotional ?? 0), 0);
  const avgRealized = closed.length ? closed.reduce((s, r) => s + (r.realizedReturn ?? 0), 0) / closed.length : null;
  return (
    <Strip
      metrics={[
        { label: "Open positions", value: fmtNum(open.length, 0) },
        { label: "Open notional", value: fmtMoney(notional) },
        { label: "Closed", value: fmtNum(closed.length, 0) },
        { label: "Avg realized", value: avgRealized == null ? "—" : fmtPct(avgRealized * 100), color: pnl(avgRealized) },
      ]}
    />
  );
}
