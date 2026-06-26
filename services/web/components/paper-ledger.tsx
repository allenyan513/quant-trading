"use client";

/**
 * Shared Paper-ledger UI — the per-user, order-driven simulated account. Pieces are
 * reused by the Paper section tabs (Positions / Activity, view-only) and the symbol
 * detail right rail (the order ticket). Positions mark live via useQuotes; writes
 * forward to the portfolio service. SIMULATED — never a real trade.
 */

import { useMemo, useState } from "react";
import { mutate } from "swr";
import { useLive } from "@/components/live";
import { useQuotes } from "@/components/quotes";
import { apiSend, apiAction } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

export interface PaperPos {
  symbol: string;
  quantity: number;
  avgCost: number;
}
export interface PaperOrder {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  fillPrice: number | null;
  status: string;
  rejectReason: string | null;
  realizedPnl: number | null;
  source: string;
  createdAt: string;
}
export interface PaperAccount {
  cash: number;
  startingCash: number;
  realizedPnl: number;
  positions: PaperPos[];
  orders: PaperOrder[];
}

const GREEN = "#3fb950";
const RED = "#f85149";
const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: 13, whiteSpace: "nowrap" };
const th: React.CSSProperties = { ...td, color: "var(--muted)", fontSize: 12, textAlign: "left", fontWeight: 600 };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
const pnlColor = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? GREEN : RED);

/** Revalidate every paper SWR key (account + blotter) after a write. */
export async function refreshPaper() {
  await Promise.all([mutate("/api/paper/account"), mutate("/api/paper/orders")]);
}

/** Reads the paper account + live marks; returns derived equity metrics. */
export function usePaperAccount() {
  const { data: acct, error } = useLive<PaperAccount>("/api/paper/account");
  const positions = acct?.positions ?? [];
  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);
  const quotes = useQuotes(symbols);
  const markOf = (p: PaperPos) => quotes.get(p.symbol)?.price ?? p.avgCost;
  const posValue = positions.reduce((s, p) => s + markOf(p) * p.quantity, 0);
  const unrealized = positions.reduce((s, p) => s + (markOf(p) - p.avgCost) * p.quantity, 0);
  const cash = acct?.cash ?? 0;
  return { acct, error, positions, quotes, cash, posValue, unrealized, equity: cash + posValue };
}

/** The order blotter — every fill/rejection, newest first. */
export function PaperBlotter({ orders }: { orders: PaperOrder[] }) {
  if (orders.length === 0) return <Empty>No orders yet.</Empty>;
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Time</th>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, ...num }}>Qty</th>
            <th style={{ ...th, ...num }}>Fill</th>
            <th style={th}>Status</th>
            <th style={{ ...th, ...num }}>Realized</th>
            <th style={th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={{ ...td, color: "var(--muted)" }} suppressHydrationWarning>
                {new Date(o.createdAt).toLocaleString()}
              </td>
              <td style={{ ...td, fontWeight: 600 }}>{o.symbol}</td>
              <td style={{ ...td, color: o.side === "buy" ? GREEN : RED, textTransform: "uppercase" }}>{o.side}</td>
              <td style={{ ...td, ...num }}>{o.quantity}</td>
              <td style={{ ...td, ...num }}>{o.fillPrice == null ? "—" : fmtMoney(o.fillPrice)}</td>
              <td style={{ ...td, color: o.status === "filled" ? "var(--text)" : RED }}>
                {o.status === "filled" ? "Filled" : `Rejected · ${o.rejectReason}`}
              </td>
              <td style={{ ...td, ...num, color: pnlColor(o.realizedPnl) }}>{o.realizedPnl == null ? "—" : fmtMoney(o.realizedPnl)}</td>
              <td style={{ ...td, color: "var(--muted)" }}>{o.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Symbol-fixed buy/sell market ticket — placed on the symbol detail right rail. */
export function PaperTicket({ symbol }: { symbol: string }) {
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState<null | "buy" | "sell">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function place(side: "buy" | "sell") {
    const q = Number(qty);
    if (!(q > 0) || busy) return;
    setBusy(side);
    setMsg(null);
    try {
      const r = await apiSend<{ status: string; fillPrice: number | null; rejectReason: string | null }>("/api/paper/orders", "POST", {
        symbol,
        side,
        quantity: q,
      });
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Request failed" });
      else if (r.data?.status === "rejected") setMsg({ ok: false, text: `Rejected — ${r.data.rejectReason}` });
      else {
        setMsg({ ok: true, text: `${side === "buy" ? "Bought" : "Sold"} ${q} ${symbol} @ ${fmtMoney(r.data?.fillPrice)}` });
        setQty("");
      }
      await refreshPaper();
    } finally {
      setBusy(null);
    }
  }

  const ready = Number(qty) > 0 && !busy;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        placeholder="Quantity"
        value={qty}
        inputMode="numeric"
        onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{ width: "100%", background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => place("buy")} disabled={!ready} style={actionBtn("#238636", ready)}>
          {busy === "buy" ? "…" : "Buy"}
        </button>
        <button onClick={() => place("sell")} disabled={!ready} style={actionBtn("#da3633", ready)}>
          {busy === "sell" ? "…" : "Sell"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: msg ? (msg.ok ? GREEN : RED) : "var(--muted)" }}>
        {msg ? msg.text : "Market order · fills at the live quote · paper (simulated)"}
      </div>
    </div>
  );
}

export function ResetButton() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (busy || !window.confirm("Reset the paper account? This wipes all positions and the blotter and restores starting cash.")) return;
    setBusy(true);
    try {
      if (await apiAction("/api/paper/reset", "POST")) await refreshPaper();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={reset}
      disabled={busy}
      style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: busy ? "default" : "pointer" }}
    >
      {busy ? "Resetting…" : "↺ Reset account"}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: 13, border: "1px solid var(--border)", padding: 12, margin: 0 }}>{children}</p>;
}

function actionBtn(color: string, enabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: color,
    border: "none",
    color: "#fff",
    padding: "9px 0",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 6,
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.5,
  };
}
