"use client";

/**
 * Holdings · Trades — executed fills from data_holdings_trades, newest first.
 * Reads /api/holdings/trades (returns a plain array) via the paginated LiveTable.
 */

import Link from "next/link";
import { LiveTable, type Column } from "@/components/live";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtNum } from "@/lib/format";

interface HoldingsTrade {
  accountId: string;
  externalTradeId: string;
  tradeDate: string | null;
  symbol: string;
  assetClass: string;
  action: string | null;
  quantity: number;
  price: number | null;
  optionType: string | null;
  strike: number | null;
  expiry: string | null;
}

function actionColor(a: string | null) {
  const s = (a ?? "").toUpperCase();
  return s === "BUY" ? "#3fb950" : s === "SELL" ? "#f85149" : "#9aa7bd";
}

function contract(t: HoldingsTrade): string {
  if (t.assetClass !== "OPT") return t.symbol;
  const k = t.optionType === "CALL" ? "C" : t.optionType === "PUT" ? "P" : "";
  return `${t.symbol} ${k}${t.strike == null ? "" : fmtNum(t.strike, 0)} ${t.expiry ?? ""}`.trim();
}

const columns: Column<HoldingsTrade>[] = [
  { key: "tradeDate", header: "Date", render: (t) => t.tradeDate ?? "—", width: 110 },
  {
    key: "symbol",
    header: "Symbol",
    render: (t) => (
      <Link href={`/workspace/data/symbol/${t.symbol}/overall`}>
        <Badge>{contract(t)}</Badge>
      </Link>
    ),
  },
  { key: "assetClass", header: "Class", render: (t) => t.assetClass },
  { key: "action", header: "Side", render: (t) => (t.action ? <Badge color={actionColor(t.action)}>{t.action}</Badge> : "—") },
  { key: "quantity", header: "Qty", render: (t) => fmtNum(t.quantity, 0) },
  { key: "price", header: "Price", render: (t) => fmtMoney(t.price) },
];

export default function HoldingsTradesPage() {
  return (
    <div>
      <LiveTable<HoldingsTrade>
        path="/api/holdings/trades"
        rowKey={(t) => `${t.accountId}:${t.externalTradeId}`}
        pageSize={50}
        columns={columns}
        filters={[
          { key: "symbol", label: "Symbol" },
          { key: "since", label: "Since (YYYY-MM-DD)" },
        ]}
        emptyText='No trades yet. Connect IBKR in Settings, then click "Refresh now".'
      />
    </div>
  );
}
