"use client";

/**
 * Horizontal tab bar for the per-symbol detail page. Highlights the active tab
 * via the App Router's selected layout segment (the bare /data/symbol/[symbol]
 * route reports null before the redirect resolves → treat as "overall").
 */

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSelectedLayoutSegment } from "next/navigation";

const TABS: { seg: string; label: string }[] = [
  { seg: "overall", label: "Overall" },
  { seg: "valuation", label: "Valuation" },
  { seg: "financials", label: "Financials" },
  { seg: "chart", label: "Chart" },
  { seg: "news", label: "News" },
  { seg: "events", label: "Events" },
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
  const router = useRouter();

  // Keyboard tab switching: `[` / `]` cycle the tabs (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const idx = Math.max(0, TABS.findIndex((t) => t.seg === active));
      const next = TABS[(idx + (e.key === "]" ? 1 : -1) + TABS.length) % TABS.length];
      if (next && symbol) router.push(`/workspace/data/symbol/${symbol}/${next.seg}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, symbol, router]);

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
            href={`/workspace/data/symbol/${symbol}/${t.seg}`}
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
