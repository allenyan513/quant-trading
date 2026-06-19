"use client";

/**
 * Horizontal tab bar for the per-symbol detail page. Highlights the active tab
 * via the App Router's selected layout segment (the bare /data/symbol/[symbol]
 * route reports null before the redirect resolves → treat as "overall").
 */

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";

const TABS: { seg: string; label: string }[] = [
  { seg: "overall", label: "Overall" },
  { seg: "valuation", label: "Valuation" },
  { seg: "financials", label: "Financials" },
  { seg: "chart", label: "Chart" },
  { seg: "news", label: "News" },
  { seg: "analysts", label: "Analysts" },
  { seg: "ownership", label: "Ownership" },
  { seg: "options", label: "Options" },
];

const ACCENT = "#58a6ff"; // data subsystem color

export function SymbolTabs() {
  const params = useParams<{ symbol: string }>();
  // Keep the URL's original casing in tab hrefs: changing the [symbol] segment
  // case (e.g. aapl→AAPL) makes Next treat it as a different route branch and
  // unmounts the shared layout, defeating cross-tab state preservation.
  const symbol = params.symbol ?? "";
  const active = useSelectedLayoutSegment() ?? "overall";

  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--border)",
        margin: "12px 0 16px",
        overflowX: "auto",
      }}
    >
      {TABS.map((t) => {
        const on = active === t.seg;
        return (
          <Link
            key={t.seg}
            href={`/data/symbol/${symbol}/${t.seg}`}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: on ? ACCENT : "var(--muted)",
              borderBottom: `2px solid ${on ? ACCENT : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
