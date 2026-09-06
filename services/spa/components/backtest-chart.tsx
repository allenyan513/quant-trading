"use client";

/**
 * Portfolio-value curve for the dividend backtest: reinvested vs not, on one
 * axis so the gap between them IS the answer the tool exists to give.
 *
 * Like nav-chart/price-chart, this is the only module importing
 * lightweight-charts for this view and must be reached through
 * backtest-chart.lazy.tsx (the lib is heavy and touches the DOM).
 *
 * Theme colors are hardcoded hexes (CSS vars don't resolve inside the canvas).
 */

import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";

export interface BacktestPoint {
  date: string; // YYYY-MM-DD
  drip: number;
  noDrip: number;
}

const DRIP = "#58a6ff"; // accent — the reinvested path
const PLAIN = "#8a97ab"; // muted — dividends taken as cash
const MUTED = "#8a97ab";
const BORDER = "#232c3d";

export function BacktestChart({ points, height = 340 }: { points: BacktestPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dripRef = useRef<ISeriesApi<"Line"> | null>(null);
  const plainRef = useRef<ISeriesApi<"Line"> | null>(null);

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
      // Headroom so the two end-of-line labels aren't pinned against the frame.
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: BORDER, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    // Only the reinvested line keeps its end-of-line price tag. With both on, the
    // two tags collide wherever the curves converge — which is most of the early
    // years — and neither is readable. The gap between the lines is what matters
    // and the panel above already states both end values exactly.
    dripRef.current = chart.addSeries(LineSeries, { color: DRIP, lineWidth: 2, priceLineVisible: false });
    plainRef.current = chart.addSeries(LineSeries, {
      color: PLAIN,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
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
      dripRef.current = null;
      plainRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!dripRef.current || !plainRef.current) return;
    dripRef.current.setData(points.map((p) => ({ time: p.date, value: p.drip })));
    plainRef.current.setData(points.map((p) => ({ time: p.date, value: p.noDrip })));
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  return (
    <div>
      <div ref={ref} style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 2, background: DRIP, verticalAlign: "middle", marginRight: 6 }} />
          Dividends reinvested
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 2, background: PLAIN, verticalAlign: "middle", marginRight: 6 }} />
          Dividends taken as cash
        </span>
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
