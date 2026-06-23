"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, type NavSection, type SubsystemPage } from "@/lib/subsystems";
import { signOut } from "@/lib/auth-client";

const SIDEBAR_WIDTH = 212;

/**
 * Vertical sidebar, grouped by product task (Portfolio / Watchlist / Discover /
 * News / Alpha) like a trading platform — see NAV_SECTIONS in lib/subsystems.ts.
 * The engineering/observability pages live under a collapsed "System" section.
 * (Backend service health moved to the System Overview page; the nav stays
 * product-facing.)
 */
export function Nav() {
  const pathname = usePathname();
  // The active nav item is the one whose href is the LONGEST prefix of the current
  // path — so a sub-tab (/data/holdings/positions) still lights its parent
  // (/data/holdings), while a sibling index+leaf (/system vs /system/logs) each win
  // on their own page rather than both lighting up.
  const activeHref =
    NAV_SECTIONS.flatMap((s) => s.pages.map((p) => p.href))
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null;
  return (
    <nav
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <Link
        href="/workspace"
        style={{
          fontWeight: 800,
          letterSpacing: 0.5,
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
      </Link>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 4px" }}>
        {NAV_SECTIONS.map((s) => (
          <Section key={s.label} section={s} activeHref={activeHref} />
        ))}
      </div>

      <button
        onClick={async () => {
          await signOut();
          window.location.href = "/";
        }}
        style={{
          margin: 10,
          padding: "7px 12px",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--muted)",
          background: "transparent",
          border: "1px solid var(--border)",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </nav>
  );
}

/** Section header: neutral muted text (de-rainbowed); the section's hue survives
 *  only as a small wayfinding dot rendered alongside (see Section). */
const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--muted)",
};

/** Tiny wayfinding dot carrying a section's hue (the only place section colour
 *  appears now that the nav is single-accent). */
function Dot({ color }: { color: string }) {
  return <span style={{ width: 5, height: 5, borderRadius: 999, background: color, flexShrink: 0 }} />;
}

/** One product section: a neutral header (+ hue dot) over its page links. A
 *  `collapsed` section (System) gets a click-to-toggle header; a `dimmed` one
 *  (Alpha, demoted in v1) renders lower-contrast while keeping its routes. */
function Section({ section, activeHref }: { section: NavSection; activeHref: string | null }) {
  const containsActive = section.pages.some((p) => p.href === activeHref);
  const [open, setOpen] = useState(!section.collapsed || containsActive);
  // Auto-expand a collapsed section when client-side nav lands on one of its pages
  // (the init above only covers a full load / first render).
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  return (
    <div className="nav-section" style={{ marginBottom: 14, opacity: section.dimmed ? 0.55 : 1 }}>
      <div className="nav-section-header" style={{ padding: "0 10px 6px" }}>
        {section.collapsed ? (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ ...headerStyle, background: "transparent", border: "none", padding: 0, width: "100%", cursor: "pointer" }}
          >
            <span style={{ fontSize: 9, width: 9 }}>{open ? "▾" : "▸"}</span>
            {section.label}
          </button>
        ) : (
          <span style={headerStyle}>
            <Dot color={section.color} />
            {section.label}
          </span>
        )}
      </div>
      {open && (
        <div className="nav-section-pages" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {section.pages.map((p) => (
            <NavItem key={p.href} page={p} active={p.href === activeHref} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single page link. Active state is the single cool accent (left bar + brighter
 *  text + panel wash), not the section hue — IBKR-style restraint. Active is
 *  computed by the parent via longest-prefix match, so sub-tabs light their parent. */
function NavItem({ page, active }: { page: SubsystemPage; active: boolean }) {
  return (
    <Link
      href={page.href}
      className="nav-item"
      style={{
        display: "block",
        padding: "6px 12px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        color: active ? "var(--text)" : "var(--muted)",
        background: active ? "var(--panel-2)" : "transparent",
      }}
    >
      {page.label}
    </Link>
  );
}
