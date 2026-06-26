"use client";

/**
 * Paper trading — the per-user, order-driven simulated account. Place market orders
 * (buy/sell long equity) from the ticket or via the MCP `place_paper_order` tool;
 * fills at the live quote, cash-accounted. Positions mark live via useQuotes; the
 * blotter logs every fill/rejection. Reads /api/paper/account (+ /orders); writes
 * forward to the portfolio service. SIMULATED — never a real trade.
 */

import { useMemo, useState } from "react";
import { mutate } from "swr";
import { useLive } from "@/components/live";
import { useQuotes } from "@/components/quotes";
import { apiSend, apiAction } from "@/lib/api-client";
import { fmtMoney, fmtPct } from "@/lib/format";

interface PaperPos {
  symbol: string;
  quantity: number;
  avgCost: number;
}
interface PaperOrder {
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
interface PaperAccount {
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

async function refreshPaper() {
  await Promise.all([mutate("/api/paper/account"), mutate("/api/paper/orders")]);
}

export default function PaperPage() {
  const { data: acct, error } = useLive<PaperAccount>("/api/paper/account");
  const positions = acct?.positions ?? [];
  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);
  const quotes = useQuotes(symbols);

  const markOf = (p: PaperPos) => quotes.get(p.symbol)?.price ?? p.avgCost;
  const posValue = positions.reduce((s, p) => s + markOf(p) * p.quantity, 0);
  const unrealized = positions.reduce((s, p) => s + (markOf(p) - p.avgCost) * p.quantity, 0);
  const cash = acct?.cash ?? 0;
  const equity = cash + posValue;

  if (error) return <p style={{ color: RED }}>Error: {String(error.message ?? error)}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Account header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 1, border: "1px solid var(--border)", background: "var(--border)" }}>
        <Stat label="Cash / buying power" value={fmtMoney(cash)} />
        <Stat label="Positions value" value={fmtMoney(posValue)} />
        <Stat label="Unrealized P&L" value={fmtMoney(unrealized)} color={pnlColor(positions.length ? unrealized : null)} />
        <Stat label="Realized P&L" value={fmtMoney(acct?.realizedPnl ?? 0)} color={pnlColor(acct?.realizedPnl ?? null)} />
        <Stat label="Total equity" value={fmtMoney(equity)} strong />
        <div style={{ flex: 1, background: "var(--panel)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <ResetButton />
        </div>
      </div>

      <OrderTicket />

      {/* Positions */}
      <div>
        <SectionLabel>Positions</SectionLabel>
        {positions.length === 0 ? (
          <Empty>No positions — place your first order above.</Empty>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>Symbol</th>
                  <th style={{ ...th, ...num }}>Qty</th>
                  <th style={{ ...th, ...num }}>Avg cost</th>
                  <th style={{ ...th, ...num }}>Last</th>
                  <th style={{ ...th, ...num }}>Mkt value</th>
                  <th style={{ ...th, ...num }}>Unrealized P&L</th>
                  <th style={{ ...th, ...num }}>Unr. %</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const live = quotes.get(p.symbol)?.price ?? null;
                  const mark = live ?? p.avgCost;
                  const upl = (mark - p.avgCost) * p.quantity;
                  const uplPct = p.avgCost !== 0 ? (mark / p.avgCost - 1) * 100 : null;
                  return (
                    <tr key={p.symbol}>
                      <td style={{ ...td, fontWeight: 600 }}>{p.symbol}</td>
                      <td style={{ ...td, ...num }}>{p.quantity}</td>
                      <td style={{ ...td, ...num }}>{fmtMoney(p.avgCost)}</td>
                      <td style={{ ...td, ...num }}>{live == null ? "—" : fmtMoney(live)}</td>
                      <td style={{ ...td, ...num }}>{fmtMoney(mark * p.quantity)}</td>
                      <td style={{ ...td, ...num, color: pnlColor(upl) }}>{fmtMoney(upl)}</td>
                      <td style={{ ...td, ...num, color: pnlColor(uplPct) }}>{fmtPct(uplPct)}</td>
                      <td style={{ ...td, ...num }}>
                        <CloseButton symbol={p.symbol} quantity={p.quantity} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Blotter */}
      <div>
        <SectionLabel>Order blotter</SectionLabel>
        {(acct?.orders ?? []).length === 0 ? (
          <Empty>No orders yet.</Empty>
        ) : (
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
                {(acct?.orders ?? []).map((o) => (
                  <tr key={o.id}>
                    <td style={{ ...td, color: "var(--muted)" }}>{new Date(o.createdAt).toLocaleString()}</td>
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
        )}
      </div>
    </div>
  );
}

/** Buy/sell market-order ticket. Fills immediately at the live quote on the server. */
function OrderTicket() {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function place() {
    const s = symbol.trim().toUpperCase();
    const q = Number(qty);
    if (!s || !(q > 0) || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await apiSend<{ status: string; fillPrice: number | null; rejectReason: string | null }>("/api/paper/orders", "POST", {
      symbol: s,
      side,
      quantity: q,
    });
    if (!r.ok) setMsg({ ok: false, text: r.error ?? "Request failed" });
    else if (r.data?.status === "rejected") setMsg({ ok: false, text: `Rejected — ${r.data.rejectReason}` });
    else {
      setMsg({ ok: true, text: `${side === "buy" ? "Bought" : "Sold"} ${q} ${s} @ ${fmtMoney(r.data?.fillPrice)}` });
      setQty("");
    }
    await refreshPaper();
    setBusy(false);
  }

  const input: React.CSSProperties = { background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 10px", fontSize: 13 };
  return (
    <div style={{ border: "1px solid var(--border)", padding: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Symbol (e.g. MU)"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && place()}
          style={{ ...input, width: 140, textTransform: "uppercase" }}
        />
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setSide("buy")} style={sideBtn(side === "buy", GREEN)}>Buy</button>
          <button onClick={() => setSide("sell")} style={sideBtn(side === "sell", RED)}>Sell</button>
        </div>
        <input
          placeholder="Qty"
          value={qty}
          inputMode="numeric"
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && place()}
          style={{ ...input, width: 100, ...num }}
        />
        <button
          onClick={place}
          disabled={busy || !symbol.trim() || !(Number(qty) > 0)}
          style={{
            background: side === "buy" ? "#1f6feb" : "#b62324",
            border: "none",
            color: "#fff",
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 6,
            cursor: busy ? "default" : "pointer",
            opacity: busy || !symbol.trim() || !(Number(qty) > 0) ? 0.5 : 1,
          }}
        >
          {busy ? "Placing…" : side === "buy" ? "Buy" : "Sell"}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg.ok ? GREEN : RED }}>{msg.text}</span>}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Market order · fills at the live quote · simulated (paper) account</div>
    </div>
  );
}

/** Sell a full position (one click). */
function CloseButton({ symbol, quantity }: { symbol: string; quantity: number }) {
  const [busy, setBusy] = useState(false);
  async function close() {
    if (busy || !window.confirm(`Sell all ${quantity} ${symbol}?`)) return;
    setBusy(true);
    await apiAction("/api/paper/orders", "POST", { symbol, side: "sell", quantity });
    await refreshPaper();
    setBusy(false);
  }
  return (
    <button
      onClick={close}
      disabled={busy}
      title={`Sell all ${quantity} ${symbol}`}
      style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", padding: "3px 10px", fontSize: 12, borderRadius: 5, cursor: busy ? "default" : "pointer" }}
    >
      {busy ? "…" : "Close"}
    </button>
  );
}

function ResetButton() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (busy || !window.confirm("Reset the paper account? This wipes all positions and the blotter and restores starting cash.")) return;
    setBusy(true);
    if (await apiAction("/api/paper/reset", "POST")) await refreshPaper();
    setBusy(false);
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

function Stat({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div style={{ background: "var(--panel)", padding: "10px 16px", minWidth: 150, flex: "0 0 auto" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: strong ? 18 : 16, fontWeight: strong ? 800 : 700, color: color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: 13, border: "1px solid var(--border)", padding: 12, margin: 0 }}>{children}</p>;
}

function sideBtn(on: boolean, color: string): React.CSSProperties {
  return {
    background: on ? color : "transparent",
    border: "none",
    color: on ? "#fff" : "var(--muted)",
    padding: "7px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}
