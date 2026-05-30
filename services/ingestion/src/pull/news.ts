/**
 * Pull recent company news from FMP into EventPayloads (one event per article).
 * NOTE: the exact FMP news endpoint/field names vary by plan; `news/stock` is
 * used here and is easy to swap. direction_hint is left null on purpose —
 * judging materiality / sentiment of news is analysis's job, not ingestion's.
 */
import { fmpGet, type EventPayload } from "@qt/shared";
import { latestPerSymbol } from "./_latest.js";
import { fetchPerSymbol } from "./_fetch.js";

interface FmpNews {
  symbol?: string;
  publishedDate?: string;
  title?: string;
  text?: string;
  url?: string;
  site?: string;
}

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
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(wallUtc))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? "00" : parts.hour!; // Intl may emit "24"
  const etWall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +hour, +parts.minute!, +parts.second!);
  // wallUtc - etWall is how far ET trails UTC at this instant; add it back.
  return new Date(wallUtc + (wallUtc - etWall)).toISOString();
}

export async function pullNews(opts: {
  from: string;
  to: string;
  symbols: string[];
  limit?: number;
}): Promise<EventPayload[]> {
  const perSymbol = await fetchPerSymbol(
    opts.symbols,
    (symbol) =>
      fmpGet<FmpNews[]>(
        "news/stock",
        { symbols: symbol, from: opts.from, to: opts.to, limit: opts.limit ?? 20 },
        { softFail402: true },
      ),
    { label: "pull.news" },
  );

  const out: EventPayload[] = [];
  for (const { symbol, rows } of perSymbol) {
    const sym = symbol.toUpperCase(); // queried per-symbol; trust the loop var, not n.symbol
    for (const n of rows) {
      if (!n.url) continue; // url is our idempotency key; skip articles without one
      out.push({
        source: "fmp",
        external_id: `news:${sym}:${n.url}`,
        symbol: sym,
        event_type: "news",
        direction_hint: null,
        headline: n.title ?? null,
        observed_at: n.publishedDate ? easternToUtcIso(n.publishedDate) ?? n.publishedDate : null,
        raw: n as unknown as Record<string, unknown>,
      });
    }
  }
  return latestPerSymbol(out);
}
