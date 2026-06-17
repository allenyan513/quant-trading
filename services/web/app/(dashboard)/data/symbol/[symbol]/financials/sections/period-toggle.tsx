"use client";

// Financials tab — annual / quarter toggle for the statement tables.

export function PeriodToggle({ period, onChange }: { period: "annual" | "quarter"; onChange: (p: "annual" | "quarter") => void }) {
  const opts: { key: "annual" | "quarter"; label: string }[] = [
    { key: "annual", label: "年报 FY" },
    { key: "quarter", label: "季报 Q" },
  ];
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {opts.map((o) => {
        const on = o.key === period;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "5px 12px",
              fontSize: 12.5,
              fontWeight: on ? 700 : 400,
              color: on ? "var(--text)" : "var(--muted)",
              background: on ? "var(--border)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
