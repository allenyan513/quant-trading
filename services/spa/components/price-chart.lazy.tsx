/**
 * Code-split loader for PriceChart (lightweight-charts is heavy + touches the DOM).
 * In the SPA there's no SSR to disable, so `next/dynamic({ssr:false})` becomes a plain
 * `React.lazy` + Suspense fallback. Same `PriceChartLazy` name as web.
 */
import { lazy, Suspense, type ComponentProps } from "react";
import type { Bar, Band, ChartMarker, MarkerKind } from "./price-chart";

const PriceChart = lazy(() => import("./price-chart").then((m) => ({ default: m.PriceChart })));

export function PriceChartLazy(props: ComponentProps<typeof PriceChart>) {
  return (
    <Suspense
      fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Loading chart…</div>}
    >
      <PriceChart {...props} />
    </Suspense>
  );
}

export type { Bar, Band, ChartMarker, MarkerKind };
