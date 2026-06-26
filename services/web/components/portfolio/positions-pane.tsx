"use client";

/**
 * Left pane of the Portfolio workbench: a positions table (IBKR/watchlist styling)
 * with row selection that drives the right-rail symbol detail, plus an Activity tab
 * (the ledger's executed history). Same shape for all three ledgers; only the data
 * source + columns differ. Live/Paper are live-marked holdings; Strategy is the
 * signal-driven sim (entry/status/realized).
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
  return ledger === "strategy" ? (
    <StrategyPositions selected={selected} onSelect={onSelect} status="open" />
  ) : (
    <HoldingsTable ledger={ledger} selected={selected} onSelect={onSelect} />
  );
}

/** The Activity tab content — the ledger's executed history. */
export function ActivityView({ ledger }: { ledger: Ledger }) {
  return <Activity ledger={ledger} />;
}

/** Live + Paper: current holdings, live-marked. */
interface HoldingRow {
  symbol: string;
  label: string;
  last: number | null;
  avg: number | null;
  mktValue: number;
  unrealized: number;
  unrealizedPct: number | null;
  selectable: boolean;
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
          return {
            symbol: p.symbol,
            label: p.symbol,
            last,
            avg: p.avgCost,
            mktValue: mark * p.quantity,
            unrealized: (mark - p.avgCost) * p.quantity,
            unrealizedPct: p.avgCost !== 0 ? (mark / p.avgCost - 1) * 100 : null,
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
              last,
              avg,
              mktValue,
              unrealized,
              unrealizedPct: avg != null && avg !== 0 && last != null ? (last / avg - 1) * 100 : null,
              selectable: true,
            };
          });

  // Auto-select the first holding so the right rail isn't empty on load.
  const firstSel = rows.find((r) => r.selectable)?.symbol;
  useEffect(() => {
    if (!selected && firstSel) onSelect(firstSel);
  }, [firstSel, selected, onSelect]);

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
              <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
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

/** Strategy: signal-driven positions (open or closed). */
interface StratRow {
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  entryPrice: number | null;
  exitPrice: number | null;
  shares: number | null;
  targetNotional: number | null;
  realizedReturn: number | null;
}
function StrategyPositions({ selected, onSelect, status }: { selected: string | null; onSelect: (s: string) => void; status: "open" | "closed" }) {
  const { data } = useLive<StratRow[]>("/api/positions?limit=500");
  const rows = (data ?? []).filter((r) => r.status === status);
  const first = rows[0]?.symbol;
  useEffect(() => {
    if (status === "open" && !selected && first) onSelect(first);
  }, [first, selected, onSelect, status]);
  if (rows.length === 0) return <Empty>No {status} signal positions.</Empty>;
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={th}>Dir</th>
            <th style={{ ...th, ...num }}>Notional</th>
            <th style={{ ...th, ...num }}>Entry</th>
            <th style={{ ...th, ...num }}>Shares</th>
            {status === "closed" && <th style={{ ...th, ...num }}>Realized</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.signalId}
              onClick={() => onSelect(r.symbol)}
              style={{ cursor: "pointer", background: selected === r.symbol ? "var(--panel-2)" : undefined }}
            >
              <td style={{ ...td, fontWeight: 600 }}>{r.symbol}</td>
              <td style={{ ...td, color: r.direction === "buy" ? GREEN : RED, textTransform: "uppercase" }}>{r.direction}</td>
              <td style={{ ...td, ...num }}>{fmtMoney(r.targetNotional)}</td>
              <td style={{ ...td, ...num }}>{fmtMoney(r.entryPrice)}</td>
              <td style={{ ...td, ...num }}>{fmtNum(r.shares)}</td>
              {status === "closed" && (
                <td style={{ ...td, ...num, color: pnl(r.realizedReturn) }}>{r.realizedReturn == null ? "—" : fmtPct(r.realizedReturn * 100)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Activity({ ledger }: { ledger: Ledger }) {
  if (ledger === "paper") return <PaperActivity />;
  if (ledger === "strategy") return <StrategyPositions selected={null} onSelect={() => {}} status="closed" />;
  return <LiveTable path="/api/holdings/trades" rowKey={(r: HoldingsTrade) => `${r.tradeDate}-${r.symbol}-${r.externalTradeId}`} columns={TRADE_COLS} emptyText="No trades." />;
}

function PaperActivity() {
  const { data: acct } = useLive<PaperAccount>("/api/paper/account");
  return <PaperBlotter orders={acct?.orders ?? []} />;
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
