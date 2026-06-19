"use client";

import { useState } from "react";
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
        href="/"
        style={{
          fontWeight: 800,
          letterSpacing: 0.5,
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        QT&nbsp;<span style={{ color: "var(--muted)", fontWeight: 600 }}>monitor</span>
      </Link>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 4px" }}>
        {NAV_SECTIONS.map((s) => (
          <Section key={s.label} section={s} pathname={pathname} />
        ))}
      </div>

      <button
        onClick={async () => {
          await signOut();
          window.location.href = "/landing";
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

const headerStyle = (color: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color,
});

/** One product section: a coloured header over its page links. A `collapsed`
 *  section (System) gets a click-to-toggle header, auto-expanded when you're on
 *  one of its pages. */
function Section({ section, pathname }: { section: NavSection; pathname: string }) {
  const containsActive = section.pages.some((p) => pathname === p.href);
  const [open, setOpen] = useState(!section.collapsed || containsActive);

  return (
    <div className="nav-section" style={{ marginBottom: 14 }}>
      <div className="nav-section-header" style={{ padding: "0 10px 6px" }}>
        {section.collapsed ? (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ ...headerStyle(section.color), background: "transparent", border: "none", padding: 0, width: "100%", cursor: "pointer" }}
          >
            <span style={{ fontSize: 9, width: 9 }}>{open ? "▾" : "▸"}</span>
            {section.label}
          </button>
        ) : (
          <span style={headerStyle(section.color)}>{section.label}</span>
        )}
      </div>
      {open && (
        <div className="nav-section-pages" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {section.pages.map((p) => (
            <NavItem key={p.href} page={p} color={section.color} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single page link with section-accented active state. */
function NavItem({ page, color, pathname }: { page: SubsystemPage; color: string; pathname: string }) {
  // Exact match: every nav target is a leaf (or the /system index), and /system
  // is also the parent of /system/logs — a prefix match would light up both.
  const active = pathname === page.href;
  return (
    <Link
      href={page.href}
      className="nav-item"
      style={{
        display: "block",
        padding: "6px 12px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 600,
        borderLeft: `2px solid ${active ? color : "transparent"}`,
        color: active ? color : "var(--muted)",
        background: active ? `${color}1f` : "transparent",
      }}
    >
      {page.label}
    </Link>
  );
}
