/**
 * Daily enrich of the earnings calendar (Discover grid). FMP `earnings-calendar` gives
 * dates + estimates but no market cap / logo, so we join `getProfile` (market cap, logo,
 * sector) — only for symbols whose cached profile is missing or >7d old, to bound FMP
 * calls — and upsert into `data_earnings_calendar`. Mutable: estimates firm up and
 * actuals/market cap refresh, so it's an upsert (not an immutable PIT row). data owns
 * the write; the gateway reads the table directly (T12).
 */
import { db, dbSchema, marketdata } from "@qt/shared";
import { fetchEarningsCalendar } from "@qt/shared/markets";
import { and, gt, inArray, sql } from "drizzle-orm";
import { log } from "../log.js";

const { earningsCalendar } = dbSchema;
const PROFILE_TTL_DAYS = 7;

interface Profile {
  marketCap: number | null;
  name: string | null;
  sector: string | null;
  logoUrl: string | null;
  exchange: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** FMP profile row → the cap/logo/sector/exchange we use. */
function shapeProfile(p: Record<string, unknown> | null): Profile {
  if (!p) return { marketCap: null, name: null, sector: null, logoUrl: null, exchange: null };
  return { marketCap: num(p.marketCap), name: str(p.companyName), sector: str(p.sector), logoUrl: str(p.image), exchange: str(p.exchange) };
}

/** Keep major US-listed names only — FMP's calendar includes OTC foreign ADRs whose
 *  (often currency-mis-scaled) market caps otherwise dominate the top-N ranking. */
function isUsExchange(exchange: string | null): boolean {
  if (!exchange) return false;
  const u = exchange.toUpperCase();
  return u.includes("NASDAQ") || u.includes("NYSE") || u.includes("AMEX");
}

function window(weeksAhead: number, weeksBack: number): { from: string; to: string } {
  const now = Date.now();
  return {
    from: new Date(now - weeksBack * 7 * 86_400_000).toISOString().slice(0, 10),
    to: new Date(now + weeksAhead * 7 * 86_400_000).toISOString().slice(0, 10),
  };
}

export async function syncEarningsCalendar(weeksAhead = 4, weeksBack = 1): Promise<{ rows: number; symbols: number; profilesFetched: number }> {
  const { from, to } = window(weeksAhead, weeksBack);
  const cal = await fetchEarningsCalendar(from, to); // analyst-covered, deduped by symbol+date
  if (cal.length === 0) {
    log.info("earnings.sync.empty", { from, to });
    return { rows: 0, symbols: 0, profilesFetched: 0 };
  }
  const symbols = [...new Set(cal.map((r) => r.symbol))];

  // Reuse a recent cached profile so daily runs only hit FMP for new / stale symbols.
  const cutoff = new Date(Date.now() - PROFILE_TTL_DAYS * 86_400_000);
  const cached = await db()
    .select({
      symbol: earningsCalendar.symbol,
      marketCap: earningsCalendar.marketCap,
      name: earningsCalendar.name,
      sector: earningsCalendar.sector,
      logoUrl: earningsCalendar.logoUrl,
    })
    .from(earningsCalendar)
    .where(and(inArray(earningsCalendar.symbol, symbols), gt(earningsCalendar.updatedAt, cutoff)));
  const profiles = new Map<string, Profile>();
  const cachedSymbols = new Set<string>(); // already in the table ⇒ already passed the US filter
  for (const c of cached) {
    if (c.marketCap != null) {
      profiles.set(c.symbol, { marketCap: c.marketCap, name: c.name, sector: c.sector, logoUrl: c.logoUrl, exchange: null });
      cachedSymbols.add(c.symbol);
    }
  }

  let profilesFetched = 0;
  for (const sym of symbols) {
    if (profiles.has(sym)) continue;
    try {
      profiles.set(sym, shapeProfile(await marketdata.getProfile(sym)));
      profilesFetched++;
    } catch (err) {
      log.warn("earnings.sync.profile_failed", { symbol: sym, error: err instanceof Error ? err.message : String(err) });
      profiles.set(sym, { marketCap: null, name: null, sector: null, logoUrl: null, exchange: null });
    }
  }

  // US-listed only: cached rows already passed this filter when first inserted; for
  // freshly-fetched profiles, gate on the exchange. Keeps the table US-only.
  const keep = cal.filter((r) => cachedSymbols.has(r.symbol) || isUsExchange(profiles.get(r.symbol)?.exchange ?? null));

  const ex = (c: string) => sql.raw(`excluded.${c}`);
  const values = keep.map((r) => {
    const p = profiles.get(r.symbol) ?? { marketCap: null, name: null, sector: null, logoUrl: null, exchange: null };
    return {
      symbol: r.symbol,
      reportDate: r.date,
      name: p.name,
      epsEstimated: r.epsEstimated,
      epsActual: r.epsActual,
      revenueEstimated: r.revenueEstimated,
      revenueActual: r.revenueActual,
      marketCap: p.marketCap,
      sector: p.sector,
      logoUrl: p.logoUrl,
      updatedAt: new Date(),
    };
  });

  let rows = 0;
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    await db()
      .insert(earningsCalendar)
      .values(chunk)
      .onConflictDoUpdate({
        target: [earningsCalendar.symbol, earningsCalendar.reportDate],
        set: {
          name: ex("name"),
          epsEstimated: ex("eps_estimated"),
          epsActual: ex("eps_actual"),
          revenueEstimated: ex("revenue_estimated"),
          revenueActual: ex("revenue_actual"),
          marketCap: ex("market_cap"),
          sector: ex("sector"),
          logoUrl: ex("logo_url"),
          updatedAt: ex("updated_at"),
        },
      });
    rows += chunk.length;
  }
  log.info("earnings.sync.done", { from, to, rows, symbols: symbols.length, profilesFetched });
  return { rows, symbols: symbols.length, profilesFetched };
}
