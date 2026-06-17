"use client";

// Financials tab — a full statement table (income / balance / cash flow),
// line-items × periods, with optional forward-estimate columns merged on the right.

import { Card } from "@/components/ui";
import { type Row, type Line, num, fmtLine, colLabel } from "./shared";

export function StatementTable({
  title,
  rows,
  lines,
  period = "annual",
  estimates = [],
  estimateMap = {},
  note,
}: {
  title: string;
  rows: Row[];
  lines: Line[];
  period?: "annual" | "quarter";
  estimates?: Row[];
  estimateMap?: Record<string, string>;
  note?: string;
}) {
  if (rows.length === 0) return null;
  const lastActual = rows.at(-1)?.fiscalDate ?? "";
  const estCols = estimates.filter((e) => e.fiscalDate > lastActual).slice(0, 3);
  const thBase: React.CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, whiteSpace: "nowrap" };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", textAlign: "right" };
  const stick: React.CSSProperties = { position: "sticky", left: 0, background: "var(--panel)" };
  return (
    <Card title={title}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: "left", ...stick }}>Line item</th>
              {rows.map((r) => (
                <th key={r.fiscalDate} style={{ ...thBase, textAlign: "right" }}>{colLabel(r.fiscalDate, period)}</th>
              ))}
              {estCols.map((e) => (
                <th key={e.fiscalDate} style={{ ...thBase, textAlign: "right", color: "#a371f7" }}>{e.fiscalDate.slice(0, 4)}E</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => {
              const estKey = estimateMap[ln.field];
              return (
                <tr key={ln.label}>
                  <td style={{ ...td, textAlign: "left", color: "var(--muted)", ...stick }}>{ln.label}</td>
                  {rows.map((r) => (
                    <td key={r.fiscalDate} style={{ ...td, ...mono }}>{fmtLine(ln.kind, num(r.data, ln.field))}</td>
                  ))}
                  {estCols.map((e) => (
                    <td key={e.fiscalDate} style={{ ...td, ...mono, color: estKey ? "#a371f7" : "var(--muted)" }}>
                      {estKey ? fmtLine(ln.kind, num(e.data, estKey)) : "·"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {estCols.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          <span style={{ color: "#a371f7" }}>E</span> = 分析师一致预期（FMP 仅预测营收与 EPS）
        </div>
      )}
      {note && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{note}</div>}
    </Card>
  );
}
