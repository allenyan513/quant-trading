"use client";

/**
 * Chart tab — candlestick + volume + fair-value overlay. Fetches the full cached
 * price window once and slices client-side by range (cheap; ~800 rows). The
 * chart itself is loaded via PriceChartLazy (ssr:false) so lightweight-charts
 * never hits the server.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card } from "@/components/ui";
import { PriceChartLazy, type Bar } from "@/components/price-chart.lazy";
import { fmtMoney, fmtFull } from "@/lib/format";

interface Prices {
  symbol: string;
  bars: Bar[];
  fairValue: number | null;
  asOf: string | null;
}

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "3M", label: "3M", days: 63 },
  { key: "6M", label: "6M", days: 126 },
  { key: "1Y", label: "1Y", days: 252 },
  { key: "All", label: "All", days: null },
];

export default function ChartTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const [range, setRange] = useState("1Y");
  const { data, error } = useLive<Prices>(`/api/data/symbol/${symbol}/prices?days=800`);

  const bars = useMemo(() => {
    const all = data?.bars ?? [];
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    return days == null ? all : all.slice(-days);
  }, [data, range]);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data || data.bars.length === 0) return <p style={{ color: "var(--muted)" }}>暂无价格数据（该 symbol 的日线未预热）。</p>;

  return (
    <Card
      title={
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>价格 · K线</span>
          <span style={{ display: "flex", gap: 4 }}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                style={{
                  background: range === r.key ? "var(--panel-2)" : "transparent",
                  border: "1px solid var(--border)",
                  color: range === r.key ? "var(--text)" : "var(--muted)",
                  borderRadius: 6,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {r.label}
              </button>
            ))}
          </span>
        </span>
      }
    >
      <PriceChartLazy bars={bars} fairValue={data.fairValue} />
      {data.fairValue != null && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          <span style={{ color: "#a371f7" }}>— — FV</span> 公允价 {fmtMoney(data.fairValue)}
          {data.asOf && <span> · 估值于 {fmtFull(data.asOf)}</span>}
        </div>
      )}
    </Card>
  );
}
