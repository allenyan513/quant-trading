"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { navSectionForPath } from "@/lib/subsystems";

/**
 * Page header. The chip names the **product section** the page lives in
 * (Portfolio / Watchlist / Discover / News / Alpha / System) in that section's
 * accent colour — derived from the path, matching the sidebar. (Was the backend
 * owner "Data · :8081"; the product nav restructure moved identity to sections.)
 * The `subsystem` prop is accepted for back-compat but no longer used.
 */
export function PageTitle({
  children,
  sub,
}: {
  children: ReactNode;
  subsystem?: string;
  sub?: ReactNode;
}) {
  const pathname = usePathname();
  const section = navSectionForPath(pathname);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      {section && <span style={{ width: 8, height: 8, borderRadius: 999, background: section.color }} />}
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{children}</h1>
      {section && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--muted)",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "1px 9px",
            whiteSpace: "nowrap",
          }}
        >
          {section.label}
        </span>
      )}
      {sub && <span style={{ color: "var(--muted)", fontSize: 13 }}>{sub}</span>}
    </div>
  );
}
