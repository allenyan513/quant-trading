/**
 * US equity regular-session clock — a pure, dependency-free check used to gate
 * near-real-time quote polling/refresh (don't poll FMP when the market is shut).
 *
 * Regular hours: Mon–Fri 09:30–16:00 America/New_York. DST is handled by Intl
 * (we read the wall-clock in the ET zone). Holidays are NOT modeled — on the ~9
 * market holidays a year we'd poll needlessly; the quote TTL + low call volume
 * make that cost negligible, and modeling a moving holiday calendar isn't worth
 * it yet. Universal (no Node APIs) so both the server and the browser import it.
 */

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** True during the US equity regular session (09:30–16:00 ET, weekdays). */
export function isUsMarketOpen(now: Date = new Date()): boolean {
  const parts = Object.fromEntries(ET_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = parts.weekday;
  if (weekday === "Sat" || weekday === "Sun") return false;
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  const minutes = hour * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
