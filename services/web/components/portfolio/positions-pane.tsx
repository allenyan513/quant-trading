"use client";

/**
 * Left pane of the Portfolio workbench: a positions table (IBKR/watchlist styling)
 * with row selection that drives the right-rail symbol detail, plus a Trades tab
 * (the ledger's executed-fill history). Same shape for every ledger; only the data source
 * + columns differ (Live = IBKR mirror, Paper = order-driven sim).
 */

import { useEffect, useMemo } from "react";
import { useLive, LiveTable, type Column } from "@/components/live";
import { useQuotes } from "@/components/quotes";
import { usePaperAccount, PaperBlotter, type PaperAccount } from "@/components/paper-ledger";
import { fmtMoney, fmtPct, fmtNum } from "@/lib/format";
import type { Ledger } from "@/components/portfolio/ledgers";

const GREEN = "#3fb950";
const RED = "#f85149";
const pnl = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? GREEN : RED);
const td: React.CSSProperties = { padding: "7px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: 13, whiteSpace: "nowrap" };
const th: React.CSSProperties = { ...td, color: "var(--muted)", fontSize: 12, textAlign: "left", fontWeight: 600 };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

/** The Positions tab content — a selectable holdings table (drives the right rail). */
export function PositionsTable({ ledger, selected, onSelect }: { ledger: Ledger; selected: string | null; onSelect: (s: string) => void }) {
  return <HoldingsTable ledger={ledger} selected={selected} onSelect={onSelect} />;
}

/** The Trades tab content — the ledger's executed-fill history. */
export function TradesView({ ledger }: { ledger: Ledger }) {
  return <Trades ledger={ledger} />;
}

/** Live + Paper: current holdings, live-marked. */
interface HoldingRow {
  symbol: string;
  label: string;
  quantity: number; // signed: < 0 = short
  last: number | null;
  avg: number | null;
  mktValue: number;
  unrealized: number;
  unrealizedPct: number | null;
  selectable: boolean;
}

/** Position return % on cost basis — sign-correct for shorts (a price drop is a gain).
 *  pct = unrealized / (avg · |qty|) · 100; null when avg/qty unknown or zero. */
function returnPct(unrealized: number, avg: number | null, quantity: number): number | null {
  if (avg == null || avg === 0 || quantity === 0) return null;
  return (unrealized / (avg * Math.abs(quantity))) * 100;
}

interface LivePos {
  symbol: string;
  assetClass: string;
  optionType: string;
  strike: number;
  expiry: string;
  quantity: number;
  avgPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
}

function HoldingsTable({ ledger, selected, onSelect }: { ledger: Ledger; selected: string | null; onSelect: (s: string) => void }) {
  const paper = usePaperAccount();
  const { data: live } = useLive<{ positions: LivePos[] }>("/api/holdings/positions");

  const symbols = useMemo(() => {
    if (ledger === "paper") return paper.positions.map((p) => p.symbol);
    return (live?.positions ?? []).filter((p) => p.assetClass !== "CASH").map((p) => p.symbol);
  }, [ledger, paper.positions, live]);
  const quotes = useQuotes(symbols);

  const rows: HoldingRow[] =
    ledger === "paper"
      ? paper.positions.map((p) => {
          const last = quotes.get(p.symbol)?.price ?? null;
          const mark = last ?? p.avgCost;
          const unrealized = (mark - p.avgCost) * p.quantity;
          return {
            symbol: p.symbol,
            label: p.symbol,
            quantity: p.quantity,
            last,
            avg: p.avgCost,
            mktValue: mark * p.quantity,
            unrealized,
            unrealizedPct: returnPct(unrealized, p.avgCost, p.quantity),
            selectable: true,
          };
        })
      : (live?.positions ?? [])
          .filter((p) => p.assetClass !== "CASH")
          .map((p) => {
            const last = quotes.get(p.symbol)?.price ?? p.markPrice ?? null;
            const avg = p.avgPrice;
            const mktValue = p.positionValue ?? (last != null ? last * p.quantity : 0);
            const unrealized = last != null && avg != null ? (last - avg) * p.quantity : 0;
            return {
              symbol: p.symbol,
              label: optionLabel(p),
              quantity: p.quantity,
              last,
              avg,
              mktValue,
              unrealized,
              unrealizedPct: last != null ? returnPct(unrealized, avg, p.quantity) : null,
              selectable: true,
            };
          });

  // Auto-select the first holding so the right rail isn't empty on load.
  const firstSel = rows.find((r) => r.selectable)?.symbol;
  useEffect(() => {
    if (!selected && firstSel) onSelect(firstSel);
  }, [firstSel, selected, onSelect]);

  // Hold the empty state back until the account/holdings have loaded, so it doesn't
  // flash "No positions" before the data arrives.
  const loading = ledger === "paper" ? !paper.acct : !live;
  if (loading) return <Empty>Loading…</Empty>;
  if (rows.length === 0) {
    return <Empty>{ledger === "paper" ? "No paper positions — buy from a symbol's detail page." : "No positions."}</Empty>;
  }
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={{ ...th, ...num }}>Last</th>
            <th style={{ ...th, ...num }}>Avg</th>
            <th style={{ ...th, ...num }}>Mkt value</th>
            <th style={{ ...th, ...num }}>Unrealized</th>
            <th style={{ ...th, ...num }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              onClick={() => r.selectable && onSelect(r.symbol)}
              style={{ cursor: r.selectable ? "pointer" : "default", background: selected === r.symbol ? "var(--panel-2)" : undefined }}
            >
              <td style={{ ...td, fontWeight: 600 }}>
                {r.label}
                {r.quantity < 0 && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: RED, border: `1px solid ${RED}`, borderRadius: 3, padding: "0 4px", verticalAlign: "middle" }}>SHORT</span>
                )}
              </td>
              <td style={{ ...td, ...num }}>{r.last == null ? "—" : fmtMoney(r.last)}</td>
              <td style={{ ...td, ...num }}>{fmtMoney(r.avg)}</td>
              <td style={{ ...td, ...num }}>{fmtMoney(r.mktValue)}</td>
              <td style={{ ...td, ...num, color: pnl(r.unrealized) }}>{fmtMoney(r.unrealized)}</td>
              <td style={{ ...td, ...num, color: pnl(r.unrealizedPct) }}>{fmtPct(r.unrealizedPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trades({ ledger }: { ledger: Ledger }) {
  if (ledger === "paper") return <PaperTrades />;
  return <LiveTable path="/api/holdings/trades" rowKey={(r: HoldingsTrade) => `${r.tradeDate}-${r.symbol}-${r.externalTradeId}`} columns={TRADE_COLS} emptyText="No trades." />;
}

function PaperTrades() {
  const { data: acct } = useLive<PaperAccount>("/api/paper/account");
  if (!acct) return <Empty>Loading…</Empty>;
  return <PaperBlotter orders={acct.orders} />;
}

interface HoldingsTrade {
  externalTradeId: string;
  tradeDate: string | null;
  symbol: string;
  action: string | null;
  quantity: number;
  price: number | null;
}
const TRADE_COLS: Column<HoldingsTrade>[] = [
  { key: "tradeDate", header: "Date", render: (r) => r.tradeDate ?? "—" },
  { key: "symbol", header: "Symbol", render: (r) => r.symbol },
  { key: "action", header: "Side", render: (r) => r.action ?? "—" },
  { key: "quantity", header: "Qty", render: (r) => fmtNum(r.quantity) },
  { key: "price", header: "Price", render: (r) => fmtMoney(r.price) },
];

function optionLabel(p: LivePos): string {
  if (p.assetClass !== "OPT") return p.symbol;
  const t = p.optionType === "CALL" ? "C" : p.optionType === "PUT" ? "P" : "";
  return `${p.symbol} ${t}${fmtNum(p.strike, 0)} ${p.expiry}`;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: 13, border: "1px solid var(--border)", padding: 12, margin: 0 }}>{children}</p>;
}
