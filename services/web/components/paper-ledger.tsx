"use client";

/**
 * Shared Paper-ledger UI — the per-user, order-driven simulated account. Pieces are
 * reused by the Paper section tabs (Positions / Orders / Activity, view-only) and the
 * symbol detail right rail (the order ticket). Positions mark live via useQuotes;
 * writes forward to the portfolio service. SIMULATED — never a real trade.
 *
 * Order lifecycle: a MARKET order fills instantly at the live quote; a LIMIT order
 * rests as a working order (the cancellable "Orders" view) and fills at its limit
 * when the quote crosses (matched on page open). Each order can carry a recorded
 * thesis (rationale / target / stop / horizon) — informational, never auto-executed.
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
  orderType: string;
  quantity: number;
  limitPrice: number | null;
  tif: string;
  fillPrice: number | null;
  status: string;
  rejectReason: string | null;
  realizedPnl: number | null;
  thesis: string | null;
  targetPrice: number | null;
  stopPrice: number | null;
  timeHorizon: string | null;
  source: string;
  createdAt: string;
}
export interface PaperAccount {
  cash: number;
  startingCash: number;
  realizedPnl: number;
  positions: PaperPos[];
  workingOrders: PaperOrder[];
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

/** Human label for a terminal order's status cell. */
function statusLabel(o: PaperOrder): { text: string; color: string } {
  if (o.status === "filled") return { text: "Filled", color: "var(--text)" };
  if (o.status === "cancelled") return { text: "Cancelled", color: "var(--muted)" };
  if (o.rejectReason === "day_expired") return { text: "Expired", color: "var(--muted)" };
  return { text: `Rejected · ${o.rejectReason ?? ""}`, color: RED };
}

/** The order blotter — terminal orders (filled / rejected / cancelled), newest first. */
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
            <th style={th}>Type</th>
            <th style={{ ...th, ...num }}>Qty</th>
            <th style={{ ...th, ...num }}>Fill</th>
            <th style={th}>Status</th>
            <th style={{ ...th, ...num }}>Realized</th>
            <th style={th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const s = statusLabel(o);
            return (
              <tr key={o.id}>
                <td style={{ ...td, color: "var(--muted)" }} suppressHydrationWarning>
                  {new Date(o.createdAt).toLocaleString()}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{o.symbol}</td>
                <td style={{ ...td, color: o.side === "buy" ? GREEN : RED, textTransform: "uppercase" }}>{o.side}</td>
                <td style={{ ...td, color: "var(--muted)" }}>
                  {o.orderType === "limit" ? `Limit @ ${fmtMoney(o.limitPrice)}` : "Market"}
                </td>
                <td style={{ ...td, ...num }}>{o.quantity}</td>
                <td style={{ ...td, ...num }}>{o.fillPrice == null ? "—" : fmtMoney(o.fillPrice)}</td>
                <td style={{ ...td, color: s.color }}>{s.text}</td>
                <td style={{ ...td, ...num, color: pnlColor(o.realizedPnl) }}>{o.realizedPnl == null ? "—" : fmtMoney(o.realizedPnl)}</td>
                <td style={{ ...td, color: "var(--muted)" }}>{o.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Working (resting) limit orders — cancellable. Reads the paper account directly. */
export function PaperOrders() {
  const { data: acct } = useLive<PaperAccount>("/api/paper/account");
  const [busy, setBusy] = useState<string | null>(null);
  if (!acct) return <Empty>Loading…</Empty>;
  const orders = acct.workingOrders ?? [];
  if (orders.length === 0) return <Empty>No working orders. Place a limit order from a symbol's detail page.</Empty>;

  async function cancel(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      if (await apiAction("/api/paper/orders/cancel", "POST", { orderId: id })) await refreshPaper();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Placed</th>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, ...num }}>Qty</th>
            <th style={{ ...th, ...num }}>Limit</th>
            <th style={th}>TIF</th>
            <th style={th}>Thesis</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={{ ...td, color: "var(--muted)" }} suppressHydrationWarning>{new Date(o.createdAt).toLocaleString()}</td>
              <td style={{ ...td, fontWeight: 600 }}>{o.symbol}</td>
              <td style={{ ...td, color: o.side === "buy" ? GREEN : RED, textTransform: "uppercase" }}>{o.side}</td>
              <td style={{ ...td, ...num }}>{o.quantity}</td>
              <td style={{ ...td, ...num }}>{fmtMoney(o.limitPrice)}</td>
              <td style={{ ...td, textTransform: "uppercase" }}>{o.tif}</td>
              <td style={{ ...td, color: "var(--muted)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }} title={thesisTooltip(o)}>
                {o.thesis ?? (o.targetPrice != null || o.stopPrice != null ? thesisTooltip(o) : "—")}
              </td>
              <td style={td}>
                <button onClick={() => cancel(o.id)} disabled={busy === o.id} style={cancelBtn(busy === o.id)}>
                  {busy === o.id ? "…" : "Cancel"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thesisTooltip(o: PaperOrder): string {
  const bits: string[] = [];
  if (o.thesis) bits.push(o.thesis);
  if (o.targetPrice != null) bits.push(`Target ${fmtMoney(o.targetPrice)}`);
  if (o.stopPrice != null) bits.push(`Stop ${fmtMoney(o.stopPrice)}`);
  if (o.timeHorizon) bits.push(`Horizon ${o.timeHorizon}`);
  return bits.join(" · ");
}

type Side = "buy" | "sell";
type OType = "market" | "limit";

/** Symbol-fixed order ticket (market/limit + optional thesis) — symbol detail right rail. */
export function PaperTicket({ symbol }: { symbol: string }) {
  const [qty, setQty] = useState("");
  const [orderType, setOrderType] = useState<OType>("market");
  const [limit, setLimit] = useState("");
  const [tif, setTif] = useState<"day" | "gtc">("gtc");
  const [showThesis, setShowThesis] = useState(false);
  const [thesis, setThesis] = useState("");
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [horizon, setHorizon] = useState("");
  const [busy, setBusy] = useState<null | Side>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function place(side: Side) {
    const q = Number(qty);
    if (!(q > 0) || busy) return;
    if (orderType === "limit" && !(Number(limit) > 0)) {
      setMsg({ ok: false, text: "Enter a limit price" });
      return;
    }
    setBusy(side);
    setMsg(null);
    try {
      const r = await apiSend<{ status: string; fillPrice: number | null; rejectReason: string | null; limitPrice: number | null }>("/api/paper/orders", "POST", {
        symbol,
        side,
        quantity: q,
        orderType,
        ...(orderType === "limit" ? { limitPrice: Number(limit), tif } : {}),
        ...(thesis.trim() ? { thesis: thesis.trim() } : {}),
        ...(Number(target) > 0 ? { targetPrice: Number(target) } : {}),
        ...(Number(stop) > 0 ? { stopPrice: Number(stop) } : {}),
        ...(horizon.trim() ? { timeHorizon: horizon.trim() } : {}),
      });
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Request failed" });
      else if (r.data?.status === "rejected") setMsg({ ok: false, text: `Rejected — ${r.data.rejectReason}` });
      else if (r.data?.status === "working") {
        setMsg({ ok: true, text: `Working — limit ${side} ${q} ${symbol} @ ${fmtMoney(r.data.limitPrice)}` });
        setQty("");
      } else {
        setMsg({ ok: true, text: `${side === "buy" ? "Bought" : "Sold"} ${q} ${symbol} @ ${fmtMoney(r.data?.fillPrice)}` });
        setQty("");
      }
      await refreshPaper();
    } finally {
      setBusy(null);
    }
  }

  const ready = Number(qty) > 0 && !busy && (orderType === "market" || Number(limit) > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Segmented value={orderType} onChange={(v) => setOrderType(v as OType)} options={[{ v: "market", label: "Market" }, { v: "limit", label: "Limit" }]} />
      <input placeholder="Quantity" value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
      {orderType === "limit" && (
        <>
          <input placeholder="Limit price" value={limit} inputMode="decimal" onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
          <Segmented value={tif} onChange={(v) => setTif(v as "day" | "gtc")} options={[{ v: "gtc", label: "GTC" }, { v: "day", label: "Day" }]} />
        </>
      )}

      <button onClick={() => setShowThesis((s) => !s)} style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 11, textAlign: "left", cursor: "pointer", padding: 0 }}>
        {showThesis ? "− Thesis" : "+ Thesis (optional)"}
      </button>
      {showThesis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea placeholder="Why this trade? When to exit?" value={thesis} onChange={(e) => setThesis(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="Target" value={target} inputMode="decimal" onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
            <input placeholder="Stop" value={stop} inputMode="decimal" onChange={(e) => setStop(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
          </div>
          <input placeholder="Horizon (e.g. 3 months)" value={horizon} onChange={(e) => setHorizon(e.target.value)} style={inputStyle} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => place("buy")} disabled={!ready} style={actionBtn("#238636", ready)}>{busy === "buy" ? "…" : "Buy"}</button>
        <button onClick={() => place("sell")} disabled={!ready} style={actionBtn("#da3633", ready)}>{busy === "sell" ? "…" : "Sell"}</button>
      </div>
      <div style={{ fontSize: 11, color: msg ? (msg.ok ? GREEN : RED) : "var(--muted)" }}>
        {msg ? msg.text : orderType === "limit" ? "Limit order · fills when the quote crosses · paper (simulated)" : "Market order · fills at the live quote · paper (simulated)"}
      </div>
    </div>
  );
}

/** Small two/three-way segmented control. */
function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{ flex: 1, background: value === o.v ? "var(--panel-2)" : "transparent", border: "none", color: value === o.v ? "var(--text)" : "var(--muted)", padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ResetButton() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (busy || !window.confirm("Reset the paper account? This wipes all positions, orders, and the blotter and restores starting cash.")) return;
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  fontVariantNumeric: "tabular-nums",
  boxSizing: "border-box",
};

function actionBtn(color: string, enabled: boolean): React.CSSProperties {
  return { flex: 1, background: color, border: "none", color: "#fff", padding: "9px 0", fontSize: 14, fontWeight: 700, borderRadius: 6, cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.5 };
}

function cancelBtn(busy: boolean): React.CSSProperties {
  return { background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: busy ? "default" : "pointer" };
}
