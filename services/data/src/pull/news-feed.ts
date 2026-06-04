/**
 * Market-wide FMP news fetch + normalization — the sole entry trigger (issue #59).
 *
 * Pulls the market-wide "latest" feeds with NO symbol filter, normalizes the
 * differing per-feed shapes into one row type, and returns them for staging in
 * `news_items` (NOT `events`). Bounded by design: paginate newest-first and stop
 * once a page falls entirely before the `from` window or `maxPages` is hit —
 * "pull everything" would exhaust the FMP rate limit and flood the table.
 *
 * The two FMP shapes:
 *   - "news" feeds (stock/general/press-release): symbol, publishedDate, title,
 *     text, url, site, image.
 *   - "fmp-articles": title, date, content (HTML), link, tickers ("NYSE:DOCN"),
 *     image, site.
 */
import { fmpGet } from "@qt/shared";
import { easternToUtcIso } from "./dates.js";
import { log } from "../log.js";

/** FMP feed -> { REST path, wire shape }. Base url already ends in /stable. */
const CATEGORY_DEFS = {
  stock: { path: "news/stock-latest", shape: "news" },
  general: { path: "news/general-latest", shape: "news" },
  press_release: { path: "news/press-releases-latest", shape: "news" },
  fmp_article: { path: "fmp-articles", shape: "article" },
} as const;

export type NewsCategory = keyof typeof CATEGORY_DEFS;
export const NEWS_CATEGORIES = Object.keys(CATEGORY_DEFS) as NewsCategory[];

/** A normalized news row, ready to stage in `news_items`. */
export interface NewsItemRow {
  category: NewsCategory;
  /** Stable dedup id within a category — the article url. */
  external_id: string;
  symbol: string | null;
  title: string | null;
  text: string | null;
  url: string | null;
  site: string | null;
  image: string | null;
  /** UTC ISO (publish time converted from ET wall-clock), or null if unparseable. */
  published_at: string | null;
  raw: Record<string, unknown>;
}

interface RawNews {
  symbol?: string;
  publishedDate?: string;
  title?: string;
  text?: string;
  url?: string;
  site?: string;
  image?: string;
}

interface RawArticle {
  title?: string;
  date?: string;
  content?: string;
  tickers?: string; // "NYSE:DOCN" or "NYSE:DOCN,NASDAQ:NVDA"
  link?: string;
  site?: string;
  image?: string;
}

/** Strip HTML tags + collapse whitespace; FMP articles ship `content` as HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** First ticker from an fmp-articles `tickers` string, exchange prefix stripped. */
export function firstTicker(tickers?: string): string | null {
  if (!tickers) return null;
  const first = tickers.split(",")[0]?.trim();
  if (!first) return null;
  const sym = first.includes(":") ? first.split(":").pop()?.trim() : first;
  return sym ? sym.toUpperCase() : null;
}

const toIso = (s?: string): string | null => (s ? easternToUtcIso(s) ?? s : null);

/**
 * `fmp-articles` `date` is naive UTC "YYYY-MM-DD HH:MM:SS" — NOT Eastern wall-clock
 * like the news/*-latest feeds. Verified empirically: applying the ET->UTC shift
 * pushed article timestamps ~4h into the future (published_at > pulled_at), which
 * wrongly ranked FMP articles above genuinely newer stock news. Parse as UTC.
 */
const articleToIso = (s?: string): string | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(se ?? 0))).toISOString();
};

export function normalizeNews(category: NewsCategory, n: RawNews): NewsItemRow {
  return {
    category,
    external_id: n.url ?? "",
    symbol: n.symbol ? n.symbol.toUpperCase() : null,
    title: n.title ?? null,
    text: n.text ?? null,
    url: n.url ?? null,
    site: n.site ?? null,
    image: n.image ?? null,
    published_at: toIso(n.publishedDate),
    raw: n as unknown as Record<string, unknown>,
  };
}

export function normalizeArticle(category: NewsCategory, a: RawArticle): NewsItemRow {
  return {
    category,
    external_id: a.link ?? "",
    symbol: firstTicker(a.tickers),
    title: a.title ?? null,
    text: a.content ? stripHtml(a.content) : null,
    url: a.link ?? null,
    site: a.site ?? null,
    image: a.image ?? null,
    published_at: articleToIso(a.date),
    raw: a as unknown as Record<string, unknown>,
  };
}

export interface PullNewsFeedArgs {
  /** Inclusive window start, YYYY-MM-DD. Articles older than this are dropped. */
  from: string;
  /** Inclusive window end, YYYY-MM-DD. */
  to: string;
  /** Max pages to fetch per category (hard ceiling on the pull). */
  maxPages: number;
  categories: NewsCategory[];
  /** Items per page (FMP `limit`). */
  pageSize?: number;
}

/** Paginate one category newest-first, normalizing + window-filtering as we go. */
async function fetchCategory(
  category: NewsCategory,
  args: PullNewsFeedArgs,
): Promise<NewsItemRow[]> {
  const def = CATEGORY_DEFS[category];
  const fromTs = Date.parse(`${args.from}T00:00:00Z`);
  const toTs = Date.parse(`${args.to}T23:59:59Z`);
  const pageSize = args.pageSize ?? 100;
  const out: NewsItemRow[] = [];

  for (let page = 0; page < args.maxPages; page++) {
    const rows = await fmpGet<unknown[]>(
      def.path,
      { page, limit: pageSize },
      { softFail402: true }, // premium-gated feed on this plan -> null, skip silently
    );
    if (!rows || rows.length === 0) break;

    let allOlder = true; // feeds are newest-first: a fully-stale page ends paging
    for (const r of rows) {
      const norm =
        def.shape === "article"
          ? normalizeArticle(category, r as RawArticle)
          : normalizeNews(category, r as RawNews);
      if (!norm.external_id) continue; // url is our dedup key; skip if missing

      const t = norm.published_at ? Date.parse(norm.published_at) : NaN;
      if (!Number.isNaN(t)) {
        if (t < fromTs) continue; // before window
        allOlder = false;
        if (t > toTs) continue; // after window (rare on a latest feed)
      } else {
        allOlder = false; // unknown date: keep, never use as a stop signal
      }
      out.push(norm);
    }

    if (rows.length < pageSize) break; // last page
    if (allOlder) break; // whole page predates `from` -> nothing newer remains
  }
  return out;
}

/**
 * Fetch + normalize the requested market-wide news feeds within [from, to],
 * bounded by `maxPages` per category. Per-category failures are isolated so one
 * bad/gated feed doesn't abort the rest. Returns flattened rows + per-feed counts.
 */
export async function pullNewsFeed(
  args: PullNewsFeedArgs,
): Promise<{ items: NewsItemRow[]; byCategory: Record<string, number> }> {
  const items: NewsItemRow[] = [];
  const byCategory: Record<string, number> = {};
  for (const category of args.categories) {
    try {
      const rows = await fetchCategory(category, args);
      byCategory[category] = rows.length;
      items.push(...rows);
    } catch (err) {
      // isolate: a failed feed contributes nothing, but don't swallow it silently
      log.warn("news.pull.category.failed", {
        category,
        error: err instanceof Error ? err.message : String(err),
      });
      byCategory[category] = 0;
    }
  }
  return { items, byCategory };
}
