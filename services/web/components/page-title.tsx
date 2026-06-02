import type { ReactNode } from "react";
import Link from "next/link";
import { subsystemByName, type SubsystemName } from "@/lib/subsystems";

/**
 * Page header that ties a page to the subsystem that owns its data: a colour
 * chip in the subsystem accent + a link back to that subsystem's landing page
 * ("owner · :port"). Makes the service boundary visible on every page.
 */
export function PageTitle({
  children,
  subsystem,
  sub,
}: {
  children: ReactNode;
  subsystem?: SubsystemName;
  sub?: ReactNode;
}) {
  const s = subsystem ? subsystemByName(subsystem) : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      {s && <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />}
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{children}</h1>
      {s && (
        <Link
          href={`/system/${s.name}`}
          title={`${s.label} 子系统`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: s.color,
            background: `${s.color}1f`,
            border: `1px solid ${s.color}40`,
            borderRadius: 999,
            padding: "1px 9px",
            whiteSpace: "nowrap",
          }}
        >
          {s.label} · :{s.port}
        </Link>
      )}
      {sub && <span style={{ color: "var(--muted)", fontSize: 13 }}>{sub}</span>}
    </div>
  );
}
