"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/events", label: "Events" },
  { href: "/notifications", label: "Notifications" },
  { href: "/signals", label: "Signals" },
  { href: "/valuations", label: "Valuations" },
  { href: "/candidates", label: "Candidates" },
  { href: "/data", label: "Data" },
  { href: "/logs", label: "Logs" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        flexWrap: "wrap",
      }}
    >
      <Link href="/" style={{ fontWeight: 800, marginRight: 16, letterSpacing: 0.5 }}>
        QT&nbsp;<span style={{ color: "var(--muted)", fontWeight: 600 }}>monitor</span>
      </Link>
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: active ? "#fff" : "var(--muted)",
              background: active ? "var(--panel-2)" : "transparent",
            }}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" });
          window.location.href = "/login";
        }}
        style={{
          marginLeft: "auto",
          padding: "5px 12px",
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
