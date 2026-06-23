"use client";

/**
 * Candlestick + volume price chart with a fair-value overlay line, built on
 * lightweight-charts (TradingView). This is the ONLY module importing the lib —
 * it must be reached exclusively through price-chart.lazy.tsx (ssr:false), since
 * lightweight-charts touches window/DOM and would crash SSR / the standalone
 * build otherwise. Pure render: data is fetched by the page and passed in.
 *
 * Theme colors are hardcoded hexes (matching the app palette) because CSS
 * variables don't resolve inside the chart's canvas.
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
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
  time: string; // YYYY-MM-DD
  value: number;
}

const UP = "#3fb950";
const DOWN = "#f85149";
const MUTED = "#8a97ab";
const BORDER = "#232c3d";
const FV = "#79c0ff"; // fair-value overlay — cool light blue, distinct from candles (was purple)

const isBar = (b: Bar): b is Bar & { open: number; high: number; low: number; close: number } =>
  b.open != null && b.high != null && b.low != null && b.close != null;

export function PriceChart({
  bars,
  fairValue,
  fvHistory = [],
}: {
  bars: Bar[];
  fairValue: number | null;
  fvHistory?: FvPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fvSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const fvLineRef = useRef<IPriceLine | null>(null);

  // Init once: create chart, series, resize observer. Recreating on every data
  // change (range switch) would flicker — instead the data effect below calls
  // setData on the existing series.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 420,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTED, fontSize: 11 },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    // Fair-value-over-time line (shares the price scale with the candles).
    fvSeriesRef.current = chart.addSeries(LineSeries, {
      color: FV,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      fvSeriesRef.current = null;
      fvLineRef.current = null;
    };
  }, []);

  // Update data + fair-value overlay in place when inputs change.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const vol = volRef.current;
    const fvSeries = fvSeriesRef.current;
    if (!chart || !candle || !vol || !fvSeries) return;

    const valid = bars.filter(isBar);
    candle.setData(valid.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    vol.setData(
      valid.map((b) => ({
        time: b.time,
        value: b.volume ?? 0,
        color: b.close >= b.open ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)",
      })),
    );

    // Clear the previous fair-value rendering.
    if (fvLineRef.current) {
      candle.removePriceLine(fvLineRef.current);
      fvLineRef.current = null;
    }
    // Restrict the FV line to the visible price window so the time scale doesn't
    // stretch beyond the candles when an older snapshot history exists.
    const firstBar = valid[0]?.time;
    const fvPts = (firstBar ? fvHistory.filter((p) => p.time >= firstBar) : fvHistory).filter((p) => Number.isFinite(p.value));
    if (fvPts.length >= 2) {
      // ≥2 points → draw the fair-value-over-time line (the "buy zone over time").
      fvSeries.setData(fvPts.map((p) => ({ time: p.time, value: p.value })));
    } else {
      // Sparse/no history → a single horizontal line at the latest fair value.
      fvSeries.setData([]);
      if (fairValue != null && Number.isFinite(fairValue)) {
        fvLineRef.current = candle.createPriceLine({
          price: fairValue,
          color: FV,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "FV",
        });
      }
    }

    chart.timeScale().fitContent();
  }, [bars, fairValue, fvHistory]);

  return <div ref={ref} style={{ width: "100%", height: 420 }} />;
}
