/**
 * Code-split loader for NavChart (lightweight-charts is heavy + touches the DOM). In
 * the SPA there's no SSR to disable, so `next/dynamic({ssr:false})` becomes `React.lazy`
 * + Suspense. Same `NavChartLazy` name as web.
 */
import { lazy, Suspense, type ComponentProps } from "react";
import type { NavPoint } from "./nav-chart";

const NavChart = lazy(() => import("./nav-chart").then((m) => ({ default: m.NavChart })));

export function NavChartLazy(props: ComponentProps<typeof NavChart>) {
  return (
    <Suspense
      fallback={
        <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Loading chart…</div>
      }
    >
      <NavChart {...props} />
    </Suspense>
  );
}

export type { NavPoint };
