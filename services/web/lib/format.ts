/** Tiny display helpers (UI-only; raw values stay numeric in the DB). */

import { VERDICT_THRESHOLD } from "./constants";

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function toDate(ts: string | Date | null | undefined): Date | null {
  if (!ts) return null;
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Relative "3m ago" / "2h ago" from an ISO string or Date. */
export function fmtAgo(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "—";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return "in the future";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Ordinal suffix for a day-of-month: 1 → "st", 2 → "nd", 21 → "st"… */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Compact absolute date for table cells: "May 20th, 23:30" (24h, local tz).
 * Includes the year only when it differs from the current year. For the full
 * precise value (seconds + timezone), see fmtFull — use it as a hover tooltip.
 */
export function fmtDate(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "—";
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const yearPart = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${month} ${day}${ordinal(day)}${yearPart}, ${time}`;
}

/**
 * Calendar-quarter label from a `YYYY-MM-DD` quarter-end date (a Postgres `date`
 * column). Parsed from the string parts — NOT `new Date()` — so it never shifts
 * across a timezone (e.g. "2026-03-31" → "Q1 2026", never "Mar 30"). Returns "—"
 * for nullish/malformed input.
 */
export function fmtQuarter(q: string | null | undefined): string {
  if (!q) return "—";
  const [y, m] = q.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return "—";
  return `Q${Math.ceil(m / 3)} ${y}`;
}

/**
 * Calendar date from a `YYYY-MM-DD` string (a Postgres `date`), parsed from the
 * parts — NOT `new Date()` — so it never shifts across a timezone. "2026-05-15"
 * → "May 15, 2026". Returns "—" for nullish/malformed input.
 */
export function fmtDay(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day || m < 1 || m > 12) return "—";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

/**
 * Full precise timestamp for detail panels / timelines:
 * "May 20, 2026, 23:30:45 GMT-7" — year/month/day, seconds, and timezone.
 */
export function fmtFull(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
}

// ============================================================
// Valuation-display helpers (ported from value-scope's lib/format.ts).
// The valuation detail page + its component closure depend on these exact names.
// ============================================================

/** Format a number with T/B/M abbreviations (e.g., $1.2T, $1.2B, $1.2M). */
export function formatLargeNumber(
  n: number,
  opts?: { prefix?: string; decimals?: number; includeK?: boolean },
): string {
  const { prefix = "$", decimals = 1, includeK = false } = opts ?? {};
  if (Math.abs(n) >= 1e12) return `${prefix}${(n / 1e12).toFixed(decimals)}T`;
  if (Math.abs(n) >= 1e9) return `${prefix}${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${prefix}${(n / 1e6).toFixed(decimals)}M`;
  if (includeK && Math.abs(n) >= 1e3) return `${prefix}${(n / 1e3).toFixed(decimals)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

/** Format a number as locale-aware USD currency (e.g., $1,234.56). */
export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a number in millions (e.g., 125000000 → "125,000"). */
export function formatMillions(n: number): string {
  const inMillions = n / 1e6;
  return inMillions.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Return a Tailwind text-color class based on upside percentage. */
export function getUpsideColor(upside: number): string {
  if (upside > VERDICT_THRESHOLD) return "text-green-400";
  if (upside < -VERDICT_THRESHOLD) return "text-red-400";
  return "text-foreground";
}

/** Format a signed percentage (e.g., +12.3% or -5.1%). */
export function formatPercent(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/** Format a decimal ratio as a percentage (e.g., 0.152 → "15.2%"). No sign prefix. */
export function formatRatio(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Format an ISO timestamp as "Apr 6, 2026 01:55" (date + time to the minute). */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}
