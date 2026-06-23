"use client";

/**
 * Tab bar for the /data/holdings page (the live IBKR account). Mirrors
 * symbol-tabs.tsx: highlights the active tab via the App Router's selected
 * layout segment. The bare /data/holdings route redirects, so segment is never
 * null here in practice; default to "performance" defensively.
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const TABS: { seg: string; label: string }[] = [
  { seg: "performance", label: "Performance" },
  { seg: "positions", label: "Positions" },
  { seg: "trades", label: "Trades" },
  { seg: "settings", label: "Settings" },
];

const ACCENT = "#58a6ff"; // data subsystem color

export function HoldingsTabs() {
  const active = useSelectedLayoutSegment() ?? "performance";
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
            href={`/workspace/data/holdings/${t.seg}`}
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
