"use client";

/**
 * Paper · Positions — account summary (cash / equity / P&L) + net positions with
 * live mark-to-market. View-only: place orders from a symbol's detail right rail.
 */

import { AccountHeader, PaperPositions, usePaperAccount } from "@/components/paper-ledger";

export default function PaperPositionsPage() {
  const { acct, error, positions, quotes, cash, posValue, unrealized, equity } = usePaperAccount();
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AccountHeader cash={cash} posValue={posValue} unrealized={unrealized} realizedPnl={acct?.realizedPnl ?? 0} equity={equity} hasPositions={positions.length > 0} />
      <PaperPositions positions={positions} quotes={quotes} />
    </div>
  );
}
