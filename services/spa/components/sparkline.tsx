/**
 * Dependency-free inline SVG sparkline. Normalizes a numeric series to its own
 * viewBox; nulls break the line into separate segments. Used by the Financials
 * tab metric rows (and reusable elsewhere). No charting library.
 */

interface Props {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, width = 120, height = 32, color = "var(--text)" }: Props) {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return <svg width={width} height={height} aria-hidden />;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pad = 2;
  const span = max - min;
  const n = values.length;
  const x = (i: number) => (n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - 2 * pad));
  const y = (v: number) => (span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - 2 * pad));

  // Break into contiguous runs of non-null points so gaps don't draw across nulls.
  const runs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (typeof v === "number" && Number.isFinite(v)) cur.push({ i, v });
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);

  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-hidden>
      {runs.map((run, ri) =>
        run.length === 1 ? (
          <circle key={ri} cx={x(run[0]!.i)} cy={y(run[0]!.v)} r={1.5} fill={color} />
        ) : (
          <polyline
            key={ri}
            points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  );
}
