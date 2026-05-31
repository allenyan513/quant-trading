"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge } from "@/components/ui";
import { fmtAgo } from "@/lib/format";

interface FreshRow {
  symbol: string;
  addedAt: string;
  lastPriceDate: string | null;
  lastIncomeKnownAt: string | null;
  lastBalanceKnownAt: string | null;
  lastCashFlowKnownAt: string | null;
}

// Flag prices older than ~5 days as stale (weekends aside, a rough signal).
function priceCell(d: string | null) {
  if (!d) return <span style={{ color: "#f85149" }}>missing</span>;
  const ageDays = (Date.now() - new Date(d).getTime()) / 86_400_000;
  return <span style={{ color: ageDays > 5 ? "#d29922" : undefined }}>{d}</span>;
}

const columns: Column<FreshRow>[] = [
  { key: "symbol", header: "Symbol", render: (r) => <Link href={`/symbol/${r.symbol}`}><Badge>{r.symbol}</Badge></Link> },
  { key: "lastPriceDate", header: "Latest price", render: (r) => priceCell(r.lastPriceDate) },
  { key: "lastIncomeKnownAt", header: "Income known_at", render: (r) => fmtAgo(r.lastIncomeKnownAt) },
  { key: "lastBalanceKnownAt", header: "Balance known_at", render: (r) => fmtAgo(r.lastBalanceKnownAt) },
  { key: "lastCashFlowKnownAt", header: "Cashflow known_at", render: (r) => fmtAgo(r.lastCashFlowKnownAt) },
  { key: "addedAt", header: "Watching since", render: (r) => fmtAgo(r.addedAt) },
];

export default function DataPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Data freshness</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Per watchlist symbol: latest cached price + latest filing known_at (PIT).</p>
      <LiveTable path="/api/data" rowKey={(r) => r.symbol} columns={columns} emptyText="Watchlist is empty — seed it first." />
    </div>
  );
}
