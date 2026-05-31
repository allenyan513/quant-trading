import type { ReactNode } from "react";

/** Semantic colour for any pipeline / delivery / lifecycle status string. */
export function statusColor(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (["delivered", "done", "target_hit", "up", "undervalued", "closed"].includes(s)) return "#3fb950";
  if (["pending", "open", "fairly_valued", "idle"].includes(s)) return "#9aa7bd";
  if (["processing"].includes(s)) return "#58a6ff";
  if (["failed", "error", "stopped_out", "stale", "overvalued"].includes(s)) return "#f85149";
  if (["noise", "expired", "warn"].includes(s)) return "#d29922";
  return "#8a97ab";
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  const c = color ?? "#8a97ab";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: c,
        background: `${c}1f`,
        border: `1px solid ${c}40`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span style={{ color: "var(--muted)" }}>—</span>;
  return <Badge color={statusColor(status)}>{status}</Badge>;
}

export function Card({ title, children, accent }: { title?: ReactNode; children: ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        borderTop: accent ? `2px solid ${accent}` : "1px solid var(--border)",
      }}
    >
      {title && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10, fontWeight: 600 }}>{title}</div>}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? "var(--text)", lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export function Grid({ children, min = 180 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 }}>
      {children}
    </div>
  );
}

export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: 12,
        color: "var(--muted)",
        maxHeight: 320,
        overflow: "auto",
      }}
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
