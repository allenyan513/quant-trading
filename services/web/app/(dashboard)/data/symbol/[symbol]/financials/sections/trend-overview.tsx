"use client";

// Financials tab — key metrics with latest · YoY · sparkline over the trend.

import { Fragment } from "react";
import { Card } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { fmtPct } from "@/lib/format";
import { type Metric, fmtKind } from "./shared";

export function TrendOverview({
  trend,
  range,
}: {
  trend: { m: Metric; series: (number | null)[]; latest: number | null; yoy: number | null; improving: boolean | null }[];
  range: string;
}) {
  const cell: React.CSSProperties = { padding: "9px 0", borderBottom: "1px solid var(--border)", minWidth: 0 };
  const hdr: React.CSSProperties = { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, paddingBottom: 8, borderBottom: "1px solid var(--border)" };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace" };
  return (
    <Card title={`关键指标 · 多年趋势${range ? ` · ${range}（annual）` : ""}`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 132px", columnGap: 14, alignItems: "center" }}>
        <div style={hdr}>指标</div>
        <div style={{ ...hdr, textAlign: "right" }}>最新</div>
        <div style={{ ...hdr, textAlign: "right" }}>YoY</div>
        <div style={{ ...hdr, textAlign: "right" }}>趋势</div>
        {trend.map(({ m, series, latest, yoy, improving }) => (
          <Fragment key={m.label}>
            <div style={{ ...cell, fontSize: 13 }}>{m.label}</div>
            <div style={{ ...cell, ...mono, fontSize: 13, textAlign: "right" }}>{fmtKind(m.kind, latest)}</div>
            <div style={{ ...cell, fontSize: 12.5, textAlign: "right", fontWeight: 600, color: yoy == null ? "var(--muted)" : improving ? "#3fb950" : "#f85149" }}>
              {yoy == null ? "—" : fmtPct(yoy * 100)}
            </div>
            <div style={{ ...cell, display: "flex", justifyContent: "flex-end" }}>
              <Sparkline values={series} color={improving === false ? "#f85149" : "#3fb950"} />
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}
