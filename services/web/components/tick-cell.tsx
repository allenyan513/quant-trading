"use client";

/**
 * A live numeric value with IBKR-style feedback, two independent visual channels:
 *   R3 — flash: when `value` changes vs the previous render, the value briefly
 *        highlights green (uptick) / red (downtick), then fades. This is the
 *        direction of THIS update — transient.
 *   R4 — color: the text is tinted by `dayChangePct` (the day's direction): green up,
 *        red down, neutral when flat/unknown. This is steady.
 *
 * Kept tiny + reusable so the portfolio positions table and the watchlist Last column
 * mark prices identically. Flash only fires after the first value is known (no flash on
 * mount), and only during real changes — so it's silent off-hours when polling stops.
 */

import { useEffect, useRef, useState } from "react";

const UP = "#3fb950";
const DOWN = "#f85149";

export function TickValue({
  value,
  dayChangePct,
  format,
}: {
  value: number | null;
  dayChangePct?: number | null;
  format: (v: number | null) => string;
}) {
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (value == null || p == null || value === p) return;
    setFlash(value > p ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [value]);

  const color = dayChangePct == null || dayChangePct === 0 ? undefined : dayChangePct > 0 ? UP : DOWN;
  return (
    <span className={flash ? `tick-flash-${flash}` : undefined} style={{ color }}>
      {format(value)}
    </span>
  );
}
