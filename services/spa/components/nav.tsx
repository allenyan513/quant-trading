"use client";

import { useState } from "react";
import Link from "@/components/link";
import { usePathname } from "@/lib/next-navigation";
import { Star, Compass, Briefcase, Settings as SettingsIcon, LogOut, PlugZap, type LucideIcon } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/subsystems";
import { signOut, useSession } from "@/lib/auth-client";

const SIDEBAR_WIDTH = 84;

// IBKR-style icon rail: each entry is a monochrome icon + label (no colour coding).
const ICONS: Record<string, LucideIcon> = {
  "/workspace/watchlist": Star,
  "/workspace/discover": Compass,
  "/workspace/portfolio": Briefcase,
};

/**
 * Narrow vertical icon rail (icon over label, monochrome — active = accent, rest
 * muted). Three product entries up top; a Settings menu (signed-in email · IBKR
 * connection · sign out) pinned at the bottom.
 */
export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const email = session?.user?.email ?? "";

  return (
    <nav
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <Link
        href="/workspace"
        aria-label="SweetValueLab"
        style={{ display: "flex", justifyContent: "center", padding: "16px 0 12px", borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--accent)" }} />
      </Link>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV_SECTIONS.map((e) => {
          const active = pathname === e.href || pathname.startsWith(`${e.href}/`);
          return <RailItem key={e.href} href={e.href} label={e.label} Icon={ICONS[e.href] ?? Star} active={active} />;
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: 6 }}>
        <RailItem label="Settings" Icon={SettingsIcon} active={menuOpen} onClick={() => setMenuOpen((o) => !o)} />
      </div>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "fixed",
              left: SIDEBAR_WIDTH - 4,
              bottom: 14,
              width: 230,
              zIndex: 41,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              padding: 6,
            }}
          >
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
              Signed in as
              <div style={{ color: "var(--text)", marginTop: 2, wordBreak: "break-all" }}>{email || "—"}</div>
            </div>
            <Link href="/workspace/portfolio/live/settings" onClick={() => setMenuOpen(false)} style={menuRow}>
              <PlugZap size={16} strokeWidth={1.75} /> IBKR connection
            </Link>
            <button
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
              style={{ ...menuRow, width: "100%", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <LogOut size={16} strokeWidth={1.75} /> Sign out
            </button>
          </div>
        </>
      )}
    </nav>
  );
}

function RailItem({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href?: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    padding: "9px 4px",
    borderRadius: 8,
    color: active ? "var(--accent)" : "var(--muted)",
    background: active ? "var(--panel-2)" : "transparent",
    textAlign: "center",
  };
  const inner = (
    <>
      <Icon size={22} strokeWidth={1.75} />
      <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, lineHeight: 1.1 }}>{label}</span>
    </>
  );
  if (href) {
    return (
      <Link className="nav-item" href={href} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button className="nav-item" onClick={onClick} style={{ ...style, width: "100%", border: "none", cursor: "pointer" }}>
      {inner}
    </button>
  );
}

const menuRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 7,
  fontSize: 13,
  color: "var(--text)",
};
