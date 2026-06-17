"use client";

// Financials tab — peer comparison: the subject vs the valuation snapshot's
// comparables, plus a median row.

import { Card } from "@/components/ui";
import { formatLargeNumber, formatRatio } from "@/lib/format";
import { type Peer, type Row, num, div, median } from "./shared";

export function PeerCompare({ symbol, peers, income, balance }: { symbol: string; peers: Peer[]; income: Row[]; balance: Row[] }) {
  if (!peers.length) return null;
  // Subject's comparable metrics derived from its own statements (PE/EV-EBITDA
  // need market data we don't have here, so left blank for the subject row).
  const li = income.at(-1)?.data ?? {};
  const lb = balance.at(-1)?.data ?? {};
  const revs = income.map((r) => num(r.data, "revenue")).filter((v): v is number => v != null);
  const subjGrowth = revs.length >= 2 ? div(revs.at(-1)! - revs.at(-2)!, Math.abs(revs.at(-2)!)) : null;
  const subj: Peer = {
    ticker: symbol,
    market_cap: null,
    trailing_pe: null,
    ev_ebitda: null,
    revenue_growth: subjGrowth,
    net_margin: div(num(li, "netIncome"), num(li, "revenue")),
    roe: div(num(li, "netIncome"), num(lb, "totalStockholdersEquity")),
  };
  const med: Peer = {
    ticker: "中位数",
    market_cap: median(peers.map((p) => p.market_cap)),
    trailing_pe: median(peers.map((p) => p.trailing_pe)),
    ev_ebitda: median(peers.map((p) => p.ev_ebitda)),
    revenue_growth: median(peers.map((p) => p.revenue_growth)),
    net_margin: median(peers.map((p) => p.net_margin)),
    roe: median(peers.map((p) => p.roe)),
  };
  const cap = (v?: number | null) => (v == null ? "—" : formatLargeNumber(v));
  const x = (v?: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
  const pc = (v?: number | null) => (v == null ? "—" : formatRatio(v));
  const cols: { h: string; f: (p: Peer) => string }[] = [
    { h: "Mkt Cap", f: (p) => cap(p.market_cap) },
    { h: "P/E", f: (p) => x(p.trailing_pe) },
    { h: "EV/EBITDA", f: (p) => x(p.ev_ebitda) },
    { h: "营收增速", f: (p) => pc(p.revenue_growth) },
    { h: "净利率", f: (p) => pc(p.net_margin) },
    { h: "ROE", f: (p) => pc(p.roe) },
  ];
  const th: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap", fontFamily: "ui-monospace, Menlo, monospace" };
  const renderRow = (p: Peer, emphasis?: "subject" | "median") => (
    <tr key={p.ticker} style={emphasis === "subject" ? { background: "rgba(88,166,255,0.08)" } : undefined}>
      <td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: emphasis ? 700 : 400, color: emphasis === "median" ? "var(--muted)" : "var(--text)" }}>
        {p.ticker}
        {p.name && emphasis !== "median" && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {p.name}</span>}
      </td>
      {cols.map((c) => (<td key={c.h} style={td}>{c.f(p)}</td>))}
    </tr>
  );
  return (
    <Card title="同业对比 · 来自估值快照的可比公司">
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "var(--panel)" }}>公司</th>
              {cols.map((c) => (<th key={c.h} style={{ ...th, textAlign: "right" }}>{c.h}</th>))}
            </tr>
          </thead>
          <tbody>
            {renderRow(subj, "subject")}
            {peers.map((p) => renderRow(p))}
            {renderRow(med, "median")}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>本票 P/E、EV/EBITDA 需市场数据，未在此计算（见 Valuation tab）。</div>
    </Card>
  );
}
