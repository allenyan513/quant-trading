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

export function Nav() {
  const pathname = usePathname();
  // Cheap 5s poll just for the per-subsystem health dots.
  const { data: beats } = useLive<Heartbeat[]>("/api/health");
  const stateOf = (svc: string) => beats?.find((b) => b.service === svc)?.state ?? "unknown";

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        flexWrap: "wrap",
      }}
    >
      <Link href="/" style={{ fontWeight: 800, marginRight: 8, letterSpacing: 0.5 }}>
        QT&nbsp;<span style={{ color: "var(--muted)", fontWeight: 600 }}>monitor</span>
      </Link>

      <NavGroup label="System" pages={SYSTEM_PAGES} pathname={pathname} />

      {SUBSYSTEMS.map((s) => (
        <NavGroup
          key={s.name}
          label={s.label}
          href={`/system/${s.name}`}
          color={s.color}
          dot={stateOf(s.name)}
          pages={s.pages}
          pathname={pathname}
        />
      ))}

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

/** A bordered cluster: subsystem label (+ health dot) followed by its pages. */
function NavGroup({
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
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "3px 8px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        borderLeft: color ? `3px solid ${color}` : "1px solid var(--border)",
      }}
    >
      <GroupLabel label={label} href={href} color={color} dot={dot} pathname={pathname} />
      {pages.map((p) => {
        const active = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            style={{
              padding: "4px 9px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              color: active ? "#fff" : "var(--muted)",
              background: active ? "var(--panel-2)" : "transparent",
            }}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

function GroupLabel({
  label,
  href,
  color,
  dot,
  pathname,
}: {
  label: string;
  href?: string;
  color?: string;
  dot?: string;
  pathname: string;
}) {
  const active = href ? pathname.startsWith(href) : false;
  const inner = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: active ? "#fff" : color ?? "var(--muted)",
        padding: "0 6px 0 2px",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          title={`${label}: ${dot}`}
          style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(dot), display: "inline-block" }}
        />
      )}
      {label}
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
