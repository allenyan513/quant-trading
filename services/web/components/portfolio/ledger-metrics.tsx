"use client";

/**
 * Account KPI strip — the simplified "Performance" surface. UNIFIED across ledgers:
 * every account (Live / Paper) is normalized to the same `AccountSummary` and rendered
 * with the SAME metric set + order (mirroring IBKR's top bar, minus the margin-account
 * fields we don't have): Daily P&L · Daily P&L % · Unrealized · Realized · Net
 * liquidity · Buying power. Only the numbers differ; a metric a ledger can't compute
 * shows "—" so the slots stay aligned (e.g. Live realized — needs trade-lot matching,
 * deferred).
 */

import { useLive } from "@/components/live";
import { usePaperAccount } from "@/components/paper-ledger";
import { fmtMoney } from "@/lib/format";
import type { Ledger } from "@/components/portfolio/ledgers";

const GREEN = "#3fb950";
const RED = "#f85149";
const pnl = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? GREEN : RED);

interface AccountSummary {
  dayPnl: number | null;
  dayPnlPct: number | null; // a percent, e.g. -2.94
  unrealized: number | null;
  realized: number | null; // null = N/A → "—"
  netLiquidity: number | null;
  buyingPower: number | null;
}

function Strip({ s }: { s: AccountSummary }) {
  const metrics: { label: string; value: string; color?: string }[] = [
    { label: "Daily P&L", value: fmtMoney(s.dayPnl), color: pnl(s.dayPnl) },
    { label: "Daily P&L %", value: s.dayPnlPct == null ? "—" : `${s.dayPnlPct >= 0 ? "+" : ""}${s.dayPnlPct.toFixed(2)}%`, color: pnl(s.dayPnlPct) },
    { label: "Unrealized P&L", value: fmtMoney(s.unrealized), color: pnl(s.unrealized) },
    { label: "Realized P&L", value: s.realized == null ? "—" : fmtMoney(s.realized), color: pnl(s.realized) },
    { label: "Net liquidity", value: fmtMoney(s.netLiquidity) },
    { label: "Buying power", value: fmtMoney(s.buyingPower) },
  ];
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
  // Live/Paper each render the same strip from their own normalized summary.
  return ledger === "paper" ? <PaperMetrics /> : <LiveMetrics />;
}

function PaperMetrics() {
  const { acct, positions, quotes, cash, unrealized, equity } = usePaperAccount();
  // Day P&L = Σ (price − prevClose) × qty from live quotes (null if none fetched yet).
  let dayPnl: number | null = null;
  for (const p of positions) {
    const q = quotes.get(p.symbol);
    if (q && q.prevClose != null) dayPnl = (dayPnl ?? 0) + (q.price - q.prevClose) * p.quantity;
  }
  const prior = dayPnl != null ? equity - dayPnl : null;
  const s: AccountSummary = {
    dayPnl,
    dayPnlPct: dayPnl != null && prior && prior !== 0 ? (dayPnl / prior) * 100 : null,
    unrealized: positions.length ? unrealized : null,
    realized: acct?.realizedPnl ?? 0,
    netLiquidity: equity,
    buyingPower: cash,
  };
  return <Strip s={s} />;
}

interface LivePos {
  assetClass: string;
  quantity: number;
  avgPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
}
interface Nav {
  endingNav: number | null;
  dayReturn: number | null;
}
function LiveMetrics() {
  const { data: nav } = useLive<Nav>("/api/holdings/nav");
  const { data: pos } = useLive<{ positions: LivePos[] }>("/api/holdings/positions");
  const all = pos?.positions ?? [];
  const cash = all.filter((p) => p.assetClass === "CASH").reduce((acc, p) => acc + (p.positionValue ?? 0), 0);
  const holds = all.filter((p) => p.assetClass !== "CASH");
  const unrealized = holds.reduce((acc, p) => acc + ((p.markPrice ?? 0) - (p.avgPrice ?? 0)) * p.quantity, 0);
  const netLiq = nav?.endingNav ?? null;
  const dr = nav?.dayReturn ?? null; // fraction
  const s: AccountSummary = {
    dayPnl: dr != null && netLiq != null ? netLiq - netLiq / (1 + dr) : null,
    dayPnlPct: dr != null ? dr * 100 : null,
    unrealized: holds.length ? unrealized : null,
    realized: null, // real-account running realized needs trade-lot matching — deferred
    netLiquidity: netLiq,
    buyingPower: all.length ? cash : null,
  };
  return <Strip s={s} />;
}
