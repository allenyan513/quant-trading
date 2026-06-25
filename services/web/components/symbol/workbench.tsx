"use client";

/**
 * 3-pane shell for the per-symbol detail page (IBKR-style, research-oriented):
 * [ watchlist rail | center tabs+content | decision panel ]. The grid lives in
 * globals.css (`.symbol-workbench`) — panes sit flush, divided by the rail/panel
 * border lines; below ~1100px the side rails fold away. The center keeps the
 * existing SymbolTabs + the routed tab content.
 */

import { useEffect } from "react";
import { SymbolTabs } from "@/components/symbol-tabs";
import { WatchlistRail } from "@/components/symbol/watchlist-rail";
import { DecisionPanel } from "@/components/symbol/decision-panel";
import { apiSend } from "@/lib/api-client";

// Symbols already ensured this session — skip the request on remount / tab switch.
// (The server has its own 24h gate; this just avoids the redundant round-trips.)
const ensuredSymbols = new Set<string>();

export function SymbolWorkbench({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  // Auto stale-while-revalidate: on opening a symbol, ask data to refresh it
  // (warm + revalue, at most once per 24h, in the background). Fire-and-forget —
  // no spinner; SWR polling brings the fresher data in. Replaces the manual button.
  useEffect(() => {
    const sym = symbol.toUpperCase();
    if (ensuredSymbols.has(sym)) return;
    ensuredSymbols.add(sym);
    void apiSend(`/api/data/symbol/${encodeURIComponent(symbol)}/ensure`, "POST");
  }, [symbol]);

  return (
    <div className="symbol-workbench">
      <aside className="symbol-rail">
        <WatchlistRail symbol={symbol} />
      </aside>

      <div style={{ minWidth: 0, padding: "0 14px" }}>
        <SymbolTabs />
        {children}
      </div>

      <aside className="symbol-decision">
        <DecisionPanel symbol={symbol} />
      </aside>
    </div>
  );
}
