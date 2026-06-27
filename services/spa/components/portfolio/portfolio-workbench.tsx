"use client";

/**
 * The "Positions" tab body of the Portfolio workbench — a 2-pane view: the positions
 * table on the left (row-click selects), the symbol detail rail on the right. The KPI
 * strip + tab bar live in the ledger layout; this is just the Positions content. The
 * right rail is tradeable only for Paper.
 */

import { useState } from "react";
import { PositionsTable } from "@/components/portfolio/positions-pane";
import { DecisionPanel } from "@/components/symbol/decision-panel";
import type { Ledger } from "@/components/portfolio/ledgers";

export function PositionsWorkbench({ ledger }: { ledger: Ledger }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="portfolio-workbench">
      <div style={{ minWidth: 0, paddingRight: 14 }}>
        <PositionsTable ledger={ledger} selected={selected} onSelect={setSelected} />
      </div>
      <aside className="portfolio-rail">
        {selected ? (
          <DecisionPanel symbol={selected} tradeable={ledger === "paper"} />
        ) : (
          <div style={{ padding: 16, color: "var(--muted)", fontSize: 13, borderLeft: "1px solid var(--border)" }}>Select a position to see its detail.</div>
        )}
      </aside>
    </div>
  );
}
