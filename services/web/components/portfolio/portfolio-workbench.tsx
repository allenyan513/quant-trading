"use client";

/**
 * Unified Portfolio workbench — ONE layout for all three ledgers (Live / Paper /
 * Strategy), IBKR-style: a top KPI strip (LedgerMetrics) + a 2-pane body (positions
 * table on the left, the symbol detail rail on the right). The ledger toggle (in the
 * section layout) switches which account this renders; the layout is identical, only
 * data + actions differ. Right rail is tradeable only for Paper.
 */

import { useState } from "react";
import Link from "next/link";
import { LedgerMetrics } from "@/components/portfolio/ledger-metrics";
import { PositionsPane } from "@/components/portfolio/positions-pane";
import { DecisionPanel } from "@/components/symbol/decision-panel";
import { ResetButton } from "@/components/paper-ledger";
import type { Ledger } from "@/components/portfolio/ledgers";

export function PortfolioWorkbench({ ledger }: { ledger: Ledger }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div>
      <LedgerMetrics ledger={ledger} />

      {/* Ledger-specific secondary affordances (don't belong in the unified body). */}
      {ledger === "live" && (
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
          <Link href="/workspace/portfolio/live/performance" style={secondaryLink}>Performance</Link>
          <Link href="/workspace/portfolio/live/morning-brief" style={secondaryLink}>Morning brief</Link>
          <Link href="/workspace/portfolio/live/settings" style={secondaryLink}>⚙ Settings</Link>
        </div>
      )}
      {ledger === "paper" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <ResetButton />
        </div>
      )}

      <div className="portfolio-workbench">
        <div style={{ minWidth: 0, paddingRight: 14 }}>
          <PositionsPane ledger={ledger} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="portfolio-rail">
          {selected ? (
            <DecisionPanel symbol={selected} tradeable={ledger === "paper"} />
          ) : (
            <div style={{ padding: 16, color: "var(--muted)", fontSize: 13, borderLeft: "1px solid var(--border)" }}>Select a position to see its detail.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

const secondaryLink: React.CSSProperties = { color: "#58a6ff", fontWeight: 600, textDecoration: "none" };
