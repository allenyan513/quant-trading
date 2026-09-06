"use client";

/**
 * Portfolio-value curve for the dividend backtest — N labelled lines on one axis.
 *
 * Two call sites, asking two different questions with the same component:
 *  - the form tool and single-fund pages plot reinvested vs dividends-as-cash,
 *    where the gap between the lines is the answer;
 *  - comparison pages plot one line per fund, both reinvested, because "SCHD vs
 *    VYM" is a question about the two funds, not about reinvestment.
 *
 * Like nav-chart/price-chart, this is the only module importing lightweight-charts
 * for this view and must be reached through backtest-chart.lazy.tsx (the lib is
 * heavy and touches the DOM).
 *
 * Theme colors are hardcoded hexes (CSS vars don't resolve inside the canvas).
 */

import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ChartSeries {
  label: string;
  points: ChartPoint[];
  /** Show this line's end-of-line price tag. Tags collide where curves converge,
   *  so only the line the reader is anchoring on should carry one. */
  showLastValue?: boolean;
  /** A reference line (the S&P 500), not a subject. Rendered muted and thinner so
   *  it reads as the backdrop — same convention as the workspace NAV-vs-SPY chart. */
  benchmark?: boolean;
}

/** Line colors in order. Stays inside the palette's meaning-free slots (accent,
 *  muted, warn) rather than inventing a categorical scheme. */
const LINE_COLORS = ["#58a6ff", "#d29922", "#3fb950", "#a371f7"];
const BENCHMARK = "#8a97ab"; // muted — the backdrop, never a subject
const MUTED = "#8a97ab";
const BORDER = "#232c3d";

/** Subjects take palette colors in order; a benchmark is always the muted one and
 *  never consumes a palette slot. */
function colorAt(series: ChartSeries[], i: number): string {
  if (series[i]?.benchmark) return BENCHMARK;
  const subjectIndex = series.slice(0, i).filter((s) => !s.benchmark).length;
  return LINE_COLORS[subjectIndex % LINE_COLORS.length] as string;
}

export function BacktestChart({ series, height = 340 }: { series: ChartSeries[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const count = series.length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: MUTED,
        fontSize: 11,
        // The library injects its own logo as a `target="_blank"` anchor with no
        // `rel` — an uncontrolled outbound link on every public page that has a
        // chart. Its licence asks for a link to tradingview.com somewhere the user
        // can see, and explicitly allows disabling the logo when that requirement
        // is met another way: we render our own credit under the legend below.
        attributionLogo: false,
      },
      // Whole dollars on the axis. The default 2-decimal format prints
      // "$32,128.33" six times down the scale, which is noise on a ten-year curve
      // where the reader is judging shape, not cents.
      localization: { priceFormatter: (v: number) => `$${Math.round(v).toLocaleString("en-US")}` },
      grid: { vertLines: { color: BORDER }, horzLines: { color: BORDER } },
      // Headroom so the end-of-line labels aren't pinned against the frame.
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    seriesRefs.current = Array.from({ length: count }, (_, i) =>
      chart.addSeries(LineSeries, {
        color: colorAt(series, i),
        lineWidth: series[i]?.benchmark ? 1 : 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }),
    );

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    };
    // Rebuild only when the number of lines changes; data updates go through the
    // effect below without tearing down the chart.
  }, [height, count]);

  useEffect(() => {
    seriesRefs.current.forEach((s, i) => {
      const src = series[i];
      if (!src) return;
      s.applyOptions({ lastValueVisible: src.showLastValue ?? false });
      s.setData(src.points.map((p) => ({ time: p.date, value: p.value })));
    });
    chartRef.current?.timeScale().fitContent();
  }, [series]);

  return (
    <div>
      <div ref={ref} style={{ width: "100%" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        {series.map((s, i) => (
          <span key={s.label}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 2,
                background: colorAt(series, i),
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            {s.label}
          </span>
        ))}
        {/* Attribution required by lightweight-charts' licence, in place of its
            injected logo — and unlike that logo, this one carries a `rel`. */}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener nofollow"
          style={{ marginLeft: "auto", color: "var(--muted)" }}
        >
          Charts by TradingView
        </a>
      </div>
    </div>
  );
}
