/** Tiny display helpers (UI-only; raw values stay numeric in the DB). */

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
