"use client";

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, TimeText } from "@/components/ui";

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
  { key: "symbol", header: "Symbol", render: (r) => <Link href={`/data/symbol/${r.symbol}/overall`}><Badge>{r.symbol}</Badge></Link> },
  { key: "lastPriceDate", header: "Latest price", render: (r) => priceCell(r.lastPriceDate) },
  { key: "lastIncomeKnownAt", header: "Income known_at", render: (r) => <TimeText ts={r.lastIncomeKnownAt} /> },
  { key: "lastBalanceKnownAt", header: "Balance known_at", render: (r) => <TimeText ts={r.lastBalanceKnownAt} /> },
  { key: "lastCashFlowKnownAt", header: "Cashflow known_at", render: (r) => <TimeText ts={r.lastCashFlowKnownAt} /> },
  { key: "addedAt", header: "Watching since", render: (r) => <TimeText ts={r.addedAt} /> },
];

export default function DataPage() {
  return (
    <div>
      <PageTitle subsystem="data">Data freshness</PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Per watchlist symbol: latest cached price + latest filing known_at (PIT).</p>
      <LiveTable path="/api/data" rowKey={(r) => r.symbol} columns={columns} emptyText="Watchlist is empty — seed it first." />
    </div>
  );
}
