"use client";

/**
 * Client-only loader for PriceChart. lightweight-charts must never be imported
 * on the server (it touches window/DOM) — `dynamic(..., {ssr:false})` keeps it
 * out of the server bundle and the Next standalone build. `ssr:false` is only
 * callable from a client component, hence this wrapper module.
 */

import dynamic from "next/dynamic";
import type { Bar } from "./price-chart";

export const PriceChartLazy = dynamic(() => import("./price-chart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Loading chart…</div>,
});

export type { Bar };
