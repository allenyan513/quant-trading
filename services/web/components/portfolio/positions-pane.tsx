"use client";

/**
 * Left pane of the Portfolio workbench: a positions table (IBKR/watchlist styling)
 * with row selection that drives the right-rail symbol detail, plus an Activity tab
 * (the ledger's executed history). Same shape for every ledger; only the data source
 * + columns differ (Live = IBKR mirror, Paper = order-driven sim).
 */

import { useEffect, useMemo } from "react";
import { useLive, LiveTable, useSort, type Column, type SortState } from "@/components/live";
import { useQuotes } from "@/components/quotes";
import { TickValue } from "@/components/tick-cell";
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

/** The Activity tab content — the ledger's executed history. */
export function ActivityView({ ledger }: { ledger: Ledger }) {
  return <Activity ledger={ledger} />;
}

/** Live + Paper: current holdings, live-marked. */
interface HoldingRow {
  symbol: string;
  label: string;
  quantity: number; // signed: < 0 = short
  last: number | null;
  dayChangePct: number | null;
  avg: number | null;
  mktValue: number;
  unrealized: number;
  unrealizedPct: number | null;
  selectable: boolean;
}

/** Column → sort accessor for the positions table (fed to the shared useSort). */
const POS_ACCESSORS: Record<string, (r: HoldingRow) => string | number | null> = {
  symbol: (r) => r.label,
  last: (r) => r.last,
  avg: (r) => r.avg,
  mktValue: (r) => r.mktValue,
  unrealized: (r) => r.unrealized,
  unrealizedPct: (r) => r.unrealizedPct,
};

/** A clickable, sortable column header (mirrors LiveTable's ▲▼↕ affordance). */
function SortHeader({ k, label, align, sort, onSort }: { k: string; label: string; align?: boolean; sort: SortState; onSort: (k: string) => void }) {
  const dir = sort?.key === k ? sort.dir : null;
  return (
    <th onClick={() => onSort(k)} style={{ ...th, ...(align ? num : {}), cursor: "pointer", userSelect: "none" }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: dir ? "var(--accent)" : "var(--border)" }}>
        {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
      </span>
    </th>
  );
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
          const q = quotes.get(p.symbol);
          const last = q?.price ?? null;
          const mark = last ?? p.avgCost;
          const unrealized = (mark - p.avgCost) * p.quantity;
          return {
            symbol: p.symbol,
            label: p.symbol,
            quantity: p.quantity,
            last,
            dayChangePct: q?.changePct ?? null,
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
            const q = quotes.get(p.symbol);
            const last = q?.price ?? p.markPrice ?? null;
            const avg = p.avgPrice;
            const mktValue = p.positionValue ?? (last != null ? last * p.quantity : 0);
            const unrealized = last != null && avg != null ? (last - avg) * p.quantity : 0;
            return {
              symbol: p.symbol,
              label: optionLabel(p),
              quantity: p.quantity,
              last,
              dayChangePct: q?.changePct ?? null,
              avg,
              mktValue,
              unrealized,
              unrealizedPct: last != null ? returnPct(unrealized, avg, p.quantity) : null,
              selectable: true,
            };
          });

  // Click any column header to sort — reuses LiveTable's sort engine, persisted per browser.
  const { sorted, sort, cycle } = useSort(rows, (key) => POS_ACCESSORS[key], "portfolio-positions");

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
            <SortHeader k="symbol" label="Symbol" sort={sort} onSort={cycle} />
            <SortHeader k="last" label="Last" align sort={sort} onSort={cycle} />
            <SortHeader k="avg" label="Avg" align sort={sort} onSort={cycle} />
            <SortHeader k="mktValue" label="Mkt value" align sort={sort} onSort={cycle} />
            <SortHeader k="unrealized" label="Unrealized" align sort={sort} onSort={cycle} />
            <SortHeader k="unrealizedPct" label="%" align sort={sort} onSort={cycle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
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
              <td style={{ ...td, ...num }}>
                <TickValue value={r.last} dayChangePct={r.dayChangePct} format={(v) => (v == null ? "—" : fmtMoney(v))} />
              </td>
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

function Activity({ ledger }: { ledger: Ledger }) {
  if (ledger === "paper") return <PaperActivity />;
  return <LiveTable path="/api/holdings/trades" rowKey={(r: HoldingsTrade) => `${r.tradeDate}-${r.symbol}-${r.externalTradeId}`} columns={TRADE_COLS} emptyText="No trades." />;
}

function PaperActivity() {
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
