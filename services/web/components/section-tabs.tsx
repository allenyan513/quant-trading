"use client";

/**
 * Generic horizontal tab bar for a section page (Discover / Portfolio). Active tab
 * from the App Router's selected layout segment; `[` / `]` cycle tabs (ignored
 * while typing). Mirrors symbol-tabs.tsx but parameterized by base path + tabs.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";

export interface TabDef {
  seg: string;
  label: string;
}

const ACCENT = "#58a6ff";

export function SectionTabs({ base, tabs, defaultSeg, margin = "4px 0 16px" }: { base: string; tabs: TabDef[]; defaultSeg: string; margin?: string }) {
  const router = useRouter();
  const active = useSelectedLayoutSegment() ?? defaultSeg;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const idx = Math.max(0, tabs.findIndex((t) => t.seg === active));
      const next = tabs[(idx + (e.key === "]" ? 1 : -1) + tabs.length) % tabs.length];
      if (next) router.push(`${base}/${next.seg}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, base, tabs, router]);

  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid var(--border)", margin }}>
      {tabs.map((t) => {
        const on = active === t.seg;
        return (
          <Link
            key={t.seg}
            href={`${base}/${t.seg}`}
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
