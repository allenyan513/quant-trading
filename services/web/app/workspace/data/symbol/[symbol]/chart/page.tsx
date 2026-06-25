"use client";

/**
 * Chart tab — research-grade price chart that fills the viewport (no page scroll):
 * candles + volume + fair-value/buy-zone, MA50/MA200, RSI + MACD panes, your
 * cost-basis line, and an events lane (earnings / 8-K / insider / dividend) from
 * our facts layer. All controls live in one top bar; the chart fills the rest.
 * Loads via PriceChartLazy (ssr:false) so lightweight-charts never hits the server.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { PriceChartLazy, type Bar, type Band, type ChartMarker, type MarkerKind } from "@/components/price-chart.lazy";
import { fmtMoney } from "@/lib/format";

interface Prices {
  symbol: string;
  bars: Bar[];
  fairValue: number | null;
  asOf: string | null;
  fvHistory: { time: string; value: number }[];
  band: Band | null;
}
interface Position {
  symbol: string;
  assetClass: string;
  avgPrice: number | null;
}

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "6M", label: "6M", days: 126 },
  { key: "1Y", label: "1Y", days: 252 },
  { key: "5Y", label: "5Y", days: 1260 },
  { key: "10Y", label: "10Y", days: 2520 },
  { key: "Max", label: "Max", days: null },
];

const MARKER_TYPES: { key: MarkerKind; label: string; color: string }[] = [
  { key: "earnings", label: "Earnings", color: "#58a6ff" },
  { key: "event", label: "8-K", color: "#d29922" },
  { key: "insider_buy", label: "Insider buy", color: "#3fb950" },
  { key: "insider_sell", label: "Insider sell", color: "#f85149" },
  { key: "dividend", label: "Dividend", color: "#8a97ab" },
];

export default function ChartTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const [range, setRange] = useState("1Y");
  const [log, setLog] = useState(false);
  const [showMA50, setMA50] = useState(true);
  const [showMA200, setMA200] = useState(true);
  const [showRSI, setRSI] = useState(true);
  const [showMACD, setMACD] = useState(true);
  const [showVal, setShowVal] = useState(true);
  const [hidden, setHidden] = useState<Set<MarkerKind>>(() => new Set());

  const { data, error } = useLive<Prices>(`/api/data/symbol/${symbol}/prices?days=2600`);
  const { data: overlays } = useLive<{ markers: ChartMarker[] }>(`/api/data/symbol/${symbol}/overlays`);
  const { data: holdings } = useLive<{ positions: Position[] }>(`/api/holdings/positions`);

  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const markers = useMemo(() => (overlays?.markers ?? []).filter((m) => !hidden.has(m.kind)), [overlays, hidden]);
  const costBasis = useMemo(
    () => holdings?.positions.find((p) => p.symbol === symbol && p.assetClass !== "OPT")?.avgPrice ?? null,
    [holdings, symbol],
  );

  const toggleMarker = (k: MarkerKind) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const band = data?.band ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 165px)", minHeight: 380 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingBottom: 8 }}>
        <span style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={pill(range === r.key)}>{r.label}</button>
          ))}
        </span>
        <button onClick={() => setLog((v) => !v)} style={pill(log)} title="Log price scale — equal vertical distance = equal % change (clearer over long ranges)">log</button>
        <span style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setMA50((v) => !v)} style={pill(showMA50, "#d29922")}>MA50</button>
          <button onClick={() => setMA200((v) => !v)} style={pill(showMA200, "#a371f7")}>MA200</button>
          <button onClick={() => setRSI((v) => !v)} style={pill(showRSI)}>RSI</button>
          <button onClick={() => setMACD((v) => !v)} style={pill(showMACD)}>MACD</button>
        </span>
        <EventsMenu hidden={hidden} onToggle={toggleMarker} />
        <button onClick={() => setShowVal((v) => !v)} style={pill(showVal, "#79c0ff")} title="Show/hide fair-value & buy-zone lines">Buy zone</button>
        {(data?.fairValue != null || (band?.low != null && band?.high != null)) && (
          <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }} title={data?.asOf ? `valued ${data.asOf}` : undefined}>
            {data?.fairValue != null && <span style={{ color: "#79c0ff" }}>FV {fmtMoney(data.fairValue)}</span>}
            {band?.low != null && band?.high != null && <span> · zone {fmtMoney(band.low)}–{fmtMoney(band.high)}</span>}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--border)" }}>
        {!data && !error && <p style={{ color: "var(--muted)", padding: 12 }}>Loading…</p>}
        {error && <p style={{ color: "#f85149", padding: 12 }}>Error: {String(error.message ?? error)}</p>}
        {data && data.bars.length === 0 && <p style={{ color: "var(--muted)", padding: 12 }}>No price data yet (daily bars for this symbol not warmed).</p>}
        {data && data.bars.length > 0 && (
          <PriceChartLazy
            bars={data.bars}
            rangeDays={rangeDays}
            fairValue={data.fairValue}
            fvHistory={data.fvHistory}
            band={data.band}
            costBasis={costBasis}
            markers={markers}
            log={log}
            showMA50={showMA50}
            showMA200={showMA200}
            showRSI={showRSI}
            showMACD={showMACD}
            showValuation={showVal}
          />
        )}
      </div>
    </div>
  );
}

/** Events ▾ dropdown — the per-type marker toggles, collapsed off the chart. */
function EventsMenu({ hidden, onToggle }: { hidden: Set<MarkerKind>; onToggle: (k: MarkerKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={pill(false)}>Events ▾</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 31, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 6, minWidth: 150, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            {MARKER_TYPES.map((m) => (
              <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", fontSize: 13, color: "var(--text)", cursor: "pointer" }}>
                <input type="checkbox" checked={!hidden.has(m.key)} onChange={() => onToggle(m.key)} />
                <span style={{ width: 9, height: 9, background: m.color, flexShrink: 0 }} />
                {m.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function pill(on: boolean, onColor?: string): React.CSSProperties {
  return {
    background: on ? "var(--panel-2)" : "transparent",
    border: "1px solid var(--border)",
    color: on ? (onColor ?? "var(--text)") : "var(--muted)",
    borderRadius: 6,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
