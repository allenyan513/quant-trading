"use client";

import Link from "next/link";

/**
 * Plain-text ticker link (no chip/pill) → the symbol detail page. IBKR-style: the
 * symbol reads as bold text, not a rounded badge. `stopPropagation` keeps a click
 * from also toggling/expanding the row; `draggable=false` stops the anchor from
 * hijacking row drag (watchlist). Single source for how a ticker renders site-wide.
 */
export function SymbolLink({ symbol }: { symbol: string }) {
  return (
    <Link
      href={`/workspace/data/symbol/${encodeURIComponent(symbol)}/overall`}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
    >
      {symbol}
    </Link>
  );
}
