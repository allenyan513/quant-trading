/**
 * The FIRE calculator's two charts: the balance fan and the years-to-FI histogram.
 *
 * Loaded ONLY through `fire-charts.lazy.tsx` — Recharts is heavy and this is a
 * public landing page, so it stays out of the main bundle (same reasoning as
 * `backtest-chart.lazy.tsx`, and the same reason it never reaches the prerender:
 * both charts are driven by the Monte Carlo, which runs in an effect).
 *
 * Colors are hex literals, not `var(--…)`: Recharts writes them into SVG
 * attributes and computed styles where a CSS custom property does not resolve.
 * They mirror `src/globals.css` — keep them in step by hand.
 */
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FanPoint, HistogramBin } from "@qt/shared/fire";
import { fmtMoney } from "@/lib/fire";

const C = {
  /** --up */
  line: "#3fb950",
  /** P5–P95 band. */
  bandOuter: "rgba(63, 185, 80, 0.08)",
  /** P25–P75 band. */
  bandInner: "rgba(63, 185, 80, 0.18)",
  /** --warn: the deterministic "expected case" marker. */
  marker: "#d29922",
  /** --accent: the FI target line. */
  target: "#58a6ff",
  /** --panel / --border / --muted */
  tooltipBg: "#131822",
  border: "#232c3d",
  axis: "#8a97ab",
  text: "#d7dee9",
} as const;

const TOOLTIP_STYLE = {
  background: C.tooltipBg,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: C.text,
} as const;

const LABEL_STYLE = { color: C.marker, fontSize: 10 } as const;
const TICK = { fontSize: 10, fill: C.axis } as const;
const MARGIN = { top: 5, right: 8, left: -10, bottom: 0 } as const;
const legendRow = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 12,
  paddingTop: 10,
  fontSize: 11,
  color: "var(--muted)",
};

/** A band's two edges as one datum, which is how Recharts draws a true range
 *  area. The original punched the inner half out of each band by re-drawing it
 *  in the page's background color — which silently breaks on any surface that
 *  isn't exactly that color, and this panel is not. */
interface FanRow extends FanPoint {
  band90: [number, number] | null;
  band50: [number, number] | null;
}

/** A log axis has no room for zero, and a wiped-out path legitimately reports a
 *  balance of 0. One dollar is below every tick and reads as "nothing left". */
const LOG_FLOOR = 1;
const floor = (v: number | null): number | null => (v == null ? null : Math.max(v, LOG_FLOOR));

const band = (lo: number | null, hi: number | null): [number, number] | null =>
  lo == null || hi == null ? null : [Math.max(lo, LOG_FLOOR), Math.max(hi, LOG_FLOOR)];

/** `$1.5M`, `$250K`, `$800`. Short enough to sit on a log axis without colliding. */
const axisMoney = (v: number): string => {
  if (v >= 1e9) return `$${v / 1e9}B`;
  if (v >= 1e6) return `$${v / 1e6}M`;
  if (v >= 1e3) return `$${v / 1e3}K`;
  return `$${v}`;
};

const swatch = (background: string) => ({
  display: "inline-block",
  width: 12,
  height: 8,
  background,
  verticalAlign: "middle" as const,
  marginRight: 4,
});

export function FanChart({ data, fiMult }: { data: readonly FanPoint[]; fiMult: number }) {
  const all: FanRow[] = data.map((d) => ({
    ...d,
    p50: floor(d.p50),
    target: floor(d.target),
    band90: band(d.p5, d.p95),
    band50: band(d.p25, d.p75),
  }));

  /** Drop leading years where the whole distribution is still at zero — starting
   *  from nothing invested, year 0 is a row of $0 that says nothing and, on a log
   *  axis, drags the domain down a decade or more and squashes everything real
   *  into the top third of the plot. */
  const firstReal = all.findIndex((r) => (r.band90?.[1] ?? 0) > LOG_FLOOR);
  const rows = firstReal > 0 ? all.slice(firstReal) : all;

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={MARGIN}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="year"
            tick={TICK}
            stroke={C.border}
            label={{ value: "yrs", position: "insideBottomRight", offset: -2, fontSize: 10, fill: C.axis }}
          />
          {/* LOG scale, deliberately. Compounding over decades puts P95 two orders
              of magnitude above the FI target — on a linear axis the lucky tail
              owns the whole plot and flattens the median and the target line into
              the bottom few pixels, which is precisely the crossing the chart
              exists to show. Log keeps every band legible at once. */}
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            allowDataOverflow={false}
            tick={TICK}
            stroke={C.border}
            tickFormatter={axisMoney}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={LABEL_STYLE}
            formatter={(value, name) =>
              Array.isArray(value)
                ? [`${fmtMoney(Number(value[0]))} – ${fmtMoney(Number(value[1]))}`, String(name)]
                : [fmtMoney(Number(value)), String(name)]
            }
            labelFormatter={(label) => `Year ${label}`}
          />
          <Area
            type="monotone"
            dataKey="band90"
            fill={C.bandOuter}
            stroke="none"
            name="P5–P95"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="band50"
            fill={C.bandInner}
            stroke="none"
            name="P25–P75"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke={C.line}
            strokeWidth={2.5}
            dot={false}
            name="Median"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="target"
            stroke={C.target}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            name="FI target"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={legendRow}>
        <span>
          <span style={{ color: C.line }}>━</span> Median (P50)
        </span>
        <span>
          <span style={swatch(C.bandInner)} />
          P25–P75 (50% of paths)
        </span>
        <span>
          <span style={swatch(C.bandOuter)} />
          P5–P95 (90% of paths)
        </span>
        <span>
          <span style={{ color: C.target }}>┄</span> FI target ({fiMult.toFixed(0)}× annual spend, inflation-adjusted)
        </span>
        <span>Balance on a log scale</span>
      </div>
    </>
  );
}

export function YearsHistogram({
  data,
  markerYears,
  markerBin,
}: {
  data: readonly HistogramBin[];
  /** Where the deterministic "expected case" lands, if it reaches FI at all. */
  markerYears: number | null;
  /** Index of the bin containing that case — highlighted rather than outlined,
   *  because a one-bar-wide reference line is easy to miss on a phone. */
  markerBin: number | null;
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data as HistogramBin[]} margin={MARGIN}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="binCenter"
            tick={TICK}
            stroke={C.border}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <YAxis tick={TICK} stroke={C.border} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={LABEL_STYLE}
            formatter={(value) => [`${Number(value)} paths`, "frequency"]}
            labelFormatter={(label) => `~${Number(label).toFixed(1)} yrs`}
          />
          <Bar dataKey="count" isAnimationActive={false}>
            {data.map((b, idx) => (
              <Cell key={b.binStart} fill={idx === markerBin ? C.marker : C.line} />
            ))}
          </Bar>
          {markerYears != null && (
            <ReferenceLine x={markerYears} stroke={C.marker} strokeWidth={2} strokeDasharray="3 3" />
          )}
        </BarChart>
      </ResponsiveContainer>
      <div style={{ ...legendRow, lineHeight: 1.6 }}>
        <span>
          <span style={{ color: C.marker }}>┃</span> Expected case (constant return) · note the right skew — the
          unlucky tail runs far longer than the lucky one is short.
        </span>
      </div>
    </>
  );
}
