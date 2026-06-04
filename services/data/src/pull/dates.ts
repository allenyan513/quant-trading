/**
 * Date helpers for FMP ingestion. FMP timestamps come as naive US-Eastern
 * wall-clock strings (no zone); these convert them to PIT-correct UTC.
 */

/**
 * FMP `publishedDate` is a naive "YYYY-MM-DD HH:MM:SS" in US Eastern time (no
 * zone). A bare `new Date(...)` would parse it in the *server's* local zone, so
 * the stored PIT timestamp would drift by hours. Convert ET wall-clock -> UTC
 * ISO via a two-pass Intl offset computation (DST-aware: EST -05:00 / EDT
 * -04:00). Returns null if unparseable.
 */
export function easternToUtcIso(naive: string): string | null {
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Provisional: treat the wall-clock as if it were UTC.
  const wallUtc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(s ?? 0));
  // Render that instant in ET, then read it back as UTC to recover the offset.
  // hourCycle "h23" forces 00-23 (hour12:false can emit "24" for midnight under
  // some ICU builds, which would land on the wrong day; h23 sidesteps that).
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(wallUtc))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const etWall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  // wallUtc - etWall is how far ET trails UTC at this instant; add it back.
  return new Date(wallUtc + (wallUtc - etWall)).toISOString();
}
