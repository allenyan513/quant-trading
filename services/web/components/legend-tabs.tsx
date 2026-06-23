"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";

// Mirrors components/symbol-tabs.tsx. Activity/Buys/Sells/History are placeholders
// for now (see /data/legends/[cik]/*); Holdings is the default tab.
const TABS: { seg: string; label: string }[] = [
  { seg: "holdings", label: "Holdings" },
  { seg: "activity", label: "Activity" },
  { seg: "buys", label: "Buys" },
  { seg: "sells", label: "Sells" },
  { seg: "history", label: "History" },
];

const ACCENT = "#58a6ff"; // data subsystem color

export function LegendTabs() {
  const params = useParams<{ cik: string }>();
  const cik = params.cik ?? "";
  const active = useSelectedLayoutSegment() ?? "holdings";

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
            href={`/workspace/data/legends/${cik}/${t.seg}`}
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
