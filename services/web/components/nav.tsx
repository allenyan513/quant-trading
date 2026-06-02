"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLive } from "@/components/live";
import { statusColor } from "@/components/ui";
import { SUBSYSTEMS, SYSTEM_PAGES, type SubsystemPage } from "@/lib/subsystems";

interface Heartbeat {
  service: string;
  last: string | null;
  state: string;
}

const SIDEBAR_WIDTH = 212;

/**
 * Vertical sidebar. The three backend services own disjoint sets of pages
 * (see lib/subsystems.ts), so the nav is grouped into sections — a cross-cutting
 * "System" section plus one per subsystem, each headed by its accent colour and a
 * live health dot. The section header links to that subsystem's landing page.
 */
export function Nav() {
  const pathname = usePathname();
  // Cheap 5s poll just for the per-subsystem health dots.
  const { data: beats } = useLive<Heartbeat[]>("/api/health");
  const stateOf = (svc: string) => beats?.find((b) => b.service === svc)?.state ?? "unknown";

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
        <Section label="System" pages={SYSTEM_PAGES} pathname={pathname} />
        {SUBSYSTEMS.map((s) => (
          <Section
            key={s.name}
            label={s.label}
            href={`/${s.slug}`}
            color={s.color}
            dot={stateOf(s.name)}
            pages={s.pages}
            pathname={pathname}
          />
        ))}
      </div>

      <button
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" });
          window.location.href = "/login";
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

/** One labelled group: a header (optionally a subsystem link + health dot) over its pages. */
function Section({
  label,
  href,
  color,
  dot,
  pages,
  pathname,
}: {
  label: string;
  href?: string;
  color?: string;
  dot?: string;
  pages: SubsystemPage[];
  pathname: string;
}) {
  const headerActive = href ? pathname === href || pathname.startsWith(`${href}/`) : false;
  const header = (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: headerActive ? "#fff" : color ?? "var(--muted)",
      }}
    >
      {dot && (
        <span
          title={`${label}: ${dot}`}
          style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(dot), flexShrink: 0 }}
        />
      )}
      {label}
    </span>
  );

  return (
    <div className="nav-section" style={{ marginBottom: 14 }}>
      <div className="nav-section-header" style={{ padding: "0 10px 6px" }}>
        {href ? (
          <Link href={href} title={`${label} 子系统`}>
            {header}
          </Link>
        ) : (
          header
        )}
      </div>
      <div className="nav-section-pages" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {pages.map((p) => (
          <NavItem key={p.href} page={p} color={color} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}

/** A single page link with subsystem-accented active state. */
function NavItem({ page, color, pathname }: { page: SubsystemPage; color?: string; pathname: string }) {
  // Exact match: every nav target is a leaf (or the /system index), and /system
  // is also the parent of /system/logs — a prefix match would light up both.
  const active = pathname === page.href;
  const accent = color ?? "var(--text)";
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
        borderLeft: `2px solid ${active ? accent : "transparent"}`,
        color: active ? accent : "var(--muted)",
        background: active ? (color ? `${color}1f` : "var(--panel-2)") : "transparent",
      }}
    >
      {page.label}
    </Link>
  );
}
