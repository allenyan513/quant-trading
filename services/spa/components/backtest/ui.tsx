/**
 * Shared presentation primitives for the dividend-backtest surface — the form
 * tool and the preset landing pages render from the same styles and the same
 * table/KPI parts, so the two can't drift into lookalikes.
 *
 * Moved verbatim out of the tool page; `input`/`primary`/`Field` are only used by
 * the form, but splitting a 90-line style module in two buys nothing.
 */
import type { CSSProperties, ReactNode } from "react";
import type { FaqEntry } from "@/lib/seo";

export const panel: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--panel)",
  borderRadius: 14,
  padding: "18px clamp(14px, 3vw, 22px)",
  marginBottom: 16,
};

export const input: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
};

export const chip: CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};

export const primary: CSSProperties = {
  height: 38,
  padding: "0 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--accent)",
  color: "#06223f",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 };
/** Section heading inside a results panel. Sized like the old h3 it replaced —
 *  the level changed for the document outline, not the visual weight. */
export const h2Style: CSSProperties = { fontSize: 15, fontWeight: 700, margin: "0 0 6px" };
export const subStyle: CSSProperties = { fontSize: 13, color: "var(--muted)", margin: "0 0 12px" };

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ? `var(--${tone})` : "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, padding: "6px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500 }}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", color }: { children: ReactNode; align?: "left" | "right"; color?: string }) {
  return <td style={{ textAlign: align, padding: "6px 8px", borderBottom: "1px solid var(--border)", color }}>{children}</td>;
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}

/**
 * FAQ rendered FROM the same array that becomes FAQPage JSON-LD. Google requires
 * the answer to be visible on the page, and hand-keeping two verbatim copies (as
 * this surface used to) is a rule waiting to be broken — one array, both outputs.
 */
export function FaqList({ items }: { items: readonly FaqEntry[] }) {
  return (
    <>
      {items.map(([q, a]) => (
        <div key={q} style={{ borderTop: "1px solid var(--border)", padding: "14px 0" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{q}</h3>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{a}</p>
        </div>
      ))}
    </>
  );
}
