"use client";

/**
 * Research price chart on lightweight-charts (TradingView). Candles + volume +
 * fair-value overlay, plus research extras: MA50/MA200, an RSI pane, a fair-value /
 * buy-zone band, the user's cost-basis line, event markers (earnings/8-K/insider/
 * dividend), a log-scale toggle, and a crosshair OHLC readout.
 *
 * This is the ONLY module importing lightweight-charts — reach it exclusively via
 * price-chart.lazy.tsx (ssr:false), since the lib touches window/DOM. Pure render:
 * all data + toggles are passed in by the page. Canvas colors are hardcoded hexes
 * (CSS variables don't resolve inside the chart canvas).
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type IPaneApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

export interface Bar {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
export interface FvPoint {
  time: string;
  value: number;
}
export interface Band {
  fair: number | null;
  low: number | null;
  high: number | null;
}
export type MarkerKind = "earnings" | "event" | "insider_buy" | "insider_sell" | "dividend";
export interface ChartMarker {
  time: string; // YYYY-MM-DD
  kind: MarkerKind;
  label: string;
}

const UP = "#3fb950";
const DOWN = "#f85149";
const MUTED = "#8a97ab";
const BORDER = "#232c3d";
const FV = "#79c0ff";
const MA50_C = "#d29922";
const MA200_C = "#a371f7";
const RSI_C = "#58a6ff";
const COST_C = "#e3b341";

const isBar = (b: Bar): b is Bar & { open: number; high: number; low: number; close: number } =>
  b.open != null && b.high != null && b.low != null && b.close != null;

/** Simple moving average aligned to the input (null until `period` samples seen). */
function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Wilder's RSI(14), aligned to the input (null until enough samples). */
function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

const MARKER_STYLE: Record<MarkerKind, { position: "aboveBar" | "belowBar"; shape: "circle" | "square" | "arrowUp" | "arrowDown"; color: string }> = {
  earnings: { position: "belowBar", shape: "circle", color: "#58a6ff" },
  event: { position: "aboveBar", shape: "square", color: "#d29922" },
  insider_buy: { position: "belowBar", shape: "arrowUp", color: UP },
  insider_sell: { position: "aboveBar", shape: "arrowDown", color: DOWN },
  dividend: { position: "belowBar", shape: "circle", color: MUTED },
};

export function PriceChart({
  bars,
  fairValue,
  fvHistory = [],
  band = null,
  costBasis = null,
  markers = [],
  log = false,
  showMA50 = true,
  showMA200 = true,
  showRSI = true,
}: {
  bars: Bar[];
  fairValue: number | null;
  fvHistory?: FvPoint[];
  band?: Band | null;
  costBasis?: number | null;
  markers?: ChartMarker[];
  log?: boolean;
  showMA50?: boolean;
  showMA200?: boolean;
  showRSI?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fvSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiPaneRef = useRef<IPaneApi<Time> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Init once: chart, base series, crosshair readout, resize. Range/toggle changes
  // mutate the existing chart in the data effect (recreating would flicker).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 460,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTED, fontSize: 11 },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    const candle = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    candleRef.current = candle;
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    fvSeriesRef.current = chart.addSeries(LineSeries, { color: FV, lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma50Ref.current = chart.addSeries(LineSeries, { color: MA50_C, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma200Ref.current = chart.addSeries(LineSeries, { color: MA200_C, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    markersRef.current = createSeriesMarkers(candle, []);

    // Crosshair OHLC readout (IBKR-style top line) — DOM-updated, no React re-render.
    chart.subscribeCrosshairMove((param) => {
      const node = legendRef.current;
      if (!node) return;
      const d = param.time ? (param.seriesData.get(candle) as { open?: number; high?: number; low?: number; close?: number } | undefined) : undefined;
      if (!d || d.open == null) {
        node.textContent = "";
        return;
      }
      const f = (n?: number) => (n == null ? "—" : n.toFixed(2));
      node.textContent = `O ${f(d.open)}  H ${f(d.high)}  L ${f(d.low)}  C ${f(d.close)}`;
    });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = fvSeriesRef.current = ma50Ref.current = ma200Ref.current = rsiRef.current = null;
      rsiPaneRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Data + overlays + toggles: re-apply in place when any input changes.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const vol = volRef.current;
    const fvSeries = fvSeriesRef.current;
    if (!chart || !candle || !vol || !fvSeries || !ma50Ref.current || !ma200Ref.current) return;

    const valid = bars.filter(isBar);
    candle.setData(valid.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    vol.setData(valid.map((b) => ({ time: b.time, value: b.volume ?? 0, color: b.close >= b.open ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)" })));

    // Moving averages (client-side SMA over closes).
    const closes = valid.map((b) => b.close);
    const ma = (period: number, on: boolean, series: ISeriesApi<"Line">) => {
      if (!on) return series.setData([]);
      const sx = sma(closes, period);
      series.setData(valid.map((b, i) => ({ time: b.time, value: sx[i] })).filter((p): p is { time: string; value: number } => p.value != null));
    };
    ma(50, showMA50, ma50Ref.current);
    ma(200, showMA200, ma200Ref.current);

    // RSI in a lazily-created second pane.
    if (showRSI && !rsiRef.current) {
      const pane = chart.addPane();
      rsiPaneRef.current = pane;
      const rs = pane.addSeries(LineSeries, { color: RSI_C, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      rs.createPriceLine({ price: 70, color: BORDER, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      rs.createPriceLine({ price: 30, color: BORDER, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      chart.panes()[0]?.setStretchFactor(3);
      pane.setStretchFactor(1);
      rsiRef.current = rs;
    } else if (!showRSI && rsiPaneRef.current) {
      chart.removePane(rsiPaneRef.current.paneIndex());
      rsiPaneRef.current = null;
      rsiRef.current = null;
    }
    if (rsiRef.current) {
      const rx = rsi(closes, 14);
      rsiRef.current.setData(valid.map((b, i) => ({ time: b.time, value: rx[i] })).filter((p): p is { time: string; value: number } => p.value != null));
    }

    // Fair-value-over-time line (restricted to the visible window).
    const firstBar = valid[0]?.time;
    const fvPts = (firstBar ? fvHistory.filter((p) => p.time >= firstBar) : fvHistory).filter((p) => Number.isFinite(p.value));
    fvSeries.setData(fvPts.length >= 2 ? fvPts.map((p) => ({ time: p.time, value: p.value })) : []);

    // Horizontal price lines: FV (if no time series), buy-zone band edges, cost basis.
    for (const pl of priceLinesRef.current) candle.removePriceLine(pl);
    priceLinesRef.current = [];
    const addLine = (price: number | null | undefined, color: string, title: string, style: LineStyle = LineStyle.Dashed) => {
      if (price == null || !Number.isFinite(price)) return;
      priceLinesRef.current.push(candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    };
    if (fvPts.length < 2) addLine(fairValue, FV, "FV");
    if (band) {
      addLine(band.high, "#6e7681", "Sell zone");
      addLine(band.low, UP, "Buy zone");
    }
    addLine(costBasis, COST_C, "Cost", LineStyle.Solid);

    // Event markers on the candles, sorted ascending + clamped to the window.
    const last = valid.at(-1)?.time;
    const inWindow = (t: string) => (!firstBar || t >= firstBar) && (!last || t <= last);
    const sm: SeriesMarker<Time>[] = markers
      .filter((m) => inWindow(m.time))
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
      .map((m) => {
        const s = MARKER_STYLE[m.kind];
        return { time: m.time as Time, position: s.position, shape: s.shape, color: s.color, text: m.label };
      });
    markersRef.current?.setMarkers(sm);

    chart.priceScale("right").applyOptions({ mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    chart.timeScale().fitContent();
  }, [bars, fairValue, fvHistory, band, costBasis, markers, log, showMA50, showMA200, showRSI]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={legendRef} style={{ position: "absolute", top: 6, left: 8, zIndex: 2, fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums", pointerEvents: "none" }} />
      <div ref={ref} style={{ width: "100%", height: 460 }} />
    </div>
  );
}
