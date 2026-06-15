"use client";

/**
 * Client-only loader for NavChart. lightweight-charts must never be imported on
 * the server (it touches window/DOM); `dynamic(..., {ssr:false})` keeps it out
 * of the server bundle. `ssr:false` is only callable from a client component.
 */

import dynamic from "next/dynamic";
import type { NavPoint } from "./nav-chart";

export const NavChartLazy = dynamic(() => import("./nav-chart").then((m) => m.NavChart), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
      Loading chart…
    </div>
  ),
});

export type { NavPoint };
