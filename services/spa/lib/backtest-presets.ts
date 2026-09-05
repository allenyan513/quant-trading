/**
 * Ready-made backtests, each on its own static path — the reason this file
 * exists is that a search engine indexes by URL, so `?p=SCHD:60,VYM:40` can
 * never rank: every parameterized variant canonicalizes back to the bare tool
 * page and does not exist as a page of its own. One preset = one crawlable URL
 * with its own title, H1 and copy.
 *
 * This registry is the SINGLE SOURCE feeding four consumers, so none of them can
 * drift: the React routes (`src/routes.tsx`), the prerender registration
 * (`prerender/entry-server.tsx`), `PUBLIC_PAGES`/sitemap (`lib/seo.ts`), and the
 * internal link lists (`components/backtest/preset-links.tsx`).
 *
 * Pure data — no JSX. Each page's editorial body lives beside the page component
 * in `pages/tools/dividend-portfolio-backtest/presets/<slug>.tsx`.
 */
import type { FaqEntry } from "@/lib/seo";
import type { DividendBacktestRequest } from "@/lib/backtest";
import { MAX_HOLDINGS, MAX_YEARS, todayISO, yearsAgoISO } from "@/lib/backtest";

export const TOOL_PATH = "/tools/dividend-portfolio-backtest";
export const presetPath = (slug: string): string => `${TOOL_PATH}/${slug}`;

export interface PresetHolding {
  symbol: string;
  /** Percent. The API normalizes anyway, but keep these summing to 100 so the
   *  weights shown on the page match what the copy says. */
  weight: number;
}

export interface BacktestPreset {
  /** URL segment: lowercase, hyphens. Frozen once published — a live URL is a
   *  promise to everyone who linked it. */
  readonly slug: string;
  readonly kind: "comparison" | "single";
  readonly holdings: readonly PresetHolding[];
  /** TRAILING window, resolved at view time. Never absolute dates: a frozen
   *  window quietly goes stale and starts contradicting the copy. */
  readonly years: number;
  readonly initial: number;
  readonly reinvest: boolean;

  /** <title> + og:title. Keep ≤60 characters. */
  readonly title: string;
  /** meta description. Keep 140–160 characters. */
  readonly description: string;
  /** The page's single <h1>. Deliberately not identical to `title`. */
  readonly h1: string;
  /** Deck paragraph under the H1. Plain text — it is also the JSON-LD
   *  description, so it has to read standalone. */
  readonly intro: string;

  /** Rendered visibly AND emitted as FAQPage JSON-LD from this one array.
   *  Per-preset by design: the same generic questions on every page is exactly
   *  the boilerplate ratio that gets scaled pages filtered. */
  readonly faq: readonly FaqEntry[];

  /** Sibling slugs to link. Validated by `assertPresetGraph()`. */
  readonly related: readonly string[];
  /** Anchor text in the hub and sibling lists. */
  readonly linkLabel: string;
  /** One line under that link. */
  readonly linkBlurb: string;

  /** Last substantive revision of THIS page's copy → `dateModified`. Per page,
   *  because pages ship one at a time. */
  readonly updated: string;
}

export const BACKTEST_PRESETS: readonly BacktestPreset[] = [
  {
    slug: "schd-vs-vym",
    kind: "comparison",
    holdings: [{ symbol: "SCHD", weight: 50 }, { symbol: "VYM", weight: 50 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "SCHD vs VYM: 10-Year Dividend Backtest",
    description:
      "SCHD vs VYM over ten years with dividends reinvested: total return, income by year, yield on cost, and how differently the two funds are built.",
    h1: "SCHD vs VYM: a 10-year dividend backtest",
    intro:
      "Two of the most-held US dividend ETFs, run side by side through the same decade with dividends reinvested — and a look at why their index rules produce very different portfolios.",
    faq: [
      [
        "Is SCHD or VYM better for dividend income?",
        "SCHD has recently carried the higher trailing yield of the two despite VYM being the fund with 'High Dividend Yield' in its name — VYM's market-cap weighting pulls it toward large, lower-yielding companies. Run the backtest above to see the income each one actually paid on the same starting amount.",
      ],
      [
        "Why do SCHD and VYM hold such different numbers of stocks?",
        "SCHD tracks the Dow Jones U.S. Dividend 100, which screens for dividend history and balance-sheet quality and then keeps about 100 names. VYM tracks the FTSE High Dividend Yield index, which simply takes the higher-yielding half of the US dividend-paying market — several hundred holdings.",
      ],
      [
        "Should I hold both SCHD and VYM?",
        "They overlap on large-cap US dividend payers, so holding both mostly dilutes whichever one you believe in rather than diversifying you. The backtest above defaults to a 50/50 split so you can see what the blend would have done; change the weights to compare against either fund on its own.",
      ],
      [
        "Does this backtest include dividend reinvestment?",
        "Yes. Each dividend buys more shares at that day's close, and the chart also plots what would have happened if you had taken the cash instead — the gap between the two lines is what reinvestment was worth.",
      ],
    ],
    related: ["schd", "jepi-vs-schd"],
    linkLabel: "SCHD vs VYM",
    linkBlurb: "Quality screen versus pure high yield, over ten years.",
    updated: "2026-09-05",
  },
  {
    slug: "jepi-vs-schd",
    kind: "comparison",
    holdings: [{ symbol: "JEPI", weight: 50 }, { symbol: "SCHD", weight: 50 }],
    years: 5,
    initial: 10_000,
    reinvest: true,
    title: "JEPI vs SCHD Backtest: Income Now or Income Growth",
    description:
      "JEPI vs SCHD backtested with dividends reinvested: what a high covered-call distribution did to total return, and what happened to the income year by year.",
    h1: "JEPI vs SCHD: income now, or income that grows?",
    intro:
      "A covered-call income fund against a dividend-growth fund. The headline yields are not comparable, and the year-by-year income table below is where the difference actually shows up.",
    faq: [
      [
        "Why is JEPI's yield so much higher than SCHD's?",
        "JEPI's distribution is mostly option premium, not dividends. It writes calls on its holdings and pays out the premium, which is why its yield can run several times SCHD's — and why that payout moves with market volatility instead of with company earnings.",
      ],
      [
        "Does JEPI's distribution go down?",
        "Yes, and unlike a dividend cut at an operating company it is a normal feature rather than a warning. Option premium falls when volatility falls. The dividend-cuts table on this page reports those declines the same way it would report any other drop in payout.",
      ],
      [
        "Can this backtest go back further than five years?",
        "Not for JEPI. The fund launched in 2020, and this tool starts every backtest on the earliest date that all of its holdings had prices, rather than quietly testing them over different lengths of history.",
      ],
      [
        "Which one produced more total return?",
        "Run it above — but read the income-by-year table alongside the total-return figure. A fund can pay a large distribution and still finish behind on total return if the payout comes at the cost of upside.",
      ],
    ],
    related: ["schd-vs-vym", "schd"],
    linkLabel: "JEPI vs SCHD",
    linkBlurb: "Covered-call income against dividend growth.",
    updated: "2026-09-05",
  },
  {
    slug: "schd",
    kind: "single",
    holdings: [{ symbol: "SCHD", weight: 100 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "SCHD Backtest: 10 Years of Dividends Reinvested",
    description:
      "Backtest SCHD over ten years: total return with and without dividend reinvestment, income every year, yield on cost, and its deepest drawdown.",
    h1: "SCHD backtest: ten years with dividends reinvested",
    intro:
      "What $10,000 in the Schwab U.S. Dividend Equity ETF did over the last decade — and, more usefully for an income investor, what it paid out each year along the way.",
    faq: [
      [
        "What does SCHD actually hold?",
        "It tracks the Dow Jones U.S. Dividend 100 index: US companies with at least ten consecutive years of dividends, ranked on cash-flow-to-debt, return on equity, dividend yield and five-year dividend growth. That screen leaves roughly 100 holdings, so it is a concentrated fund by index-fund standards.",
      ],
      [
        "Has SCHD ever cut its dividend?",
        "The dividend-cuts table on this page answers that for whatever window you run. Note that an ETF's payout is the sum of what its holdings paid, so it varies quarter to quarter even when no underlying company cut anything — this tool only flags a year where both the annual total and the average payment fell.",
      ],
      [
        "What is yield on cost, and why is it higher than SCHD's stated yield?",
        "Yield on cost measures the last twelve months of income against what you originally invested, not against today's price. With dividends reinvested it also carries the share count you accumulated, so after a decade it runs well ahead of the fund's quoted yield.",
      ],
      [
        "Does this include taxes and fees?",
        "No. Returns here are gross: no dividend withholding, no commissions, and no fees beyond the fund's own expense ratio, which is already inside its price. A taxable account did worse than this.",
      ],
    ],
    related: ["schd-vs-vym", "jepi-vs-schd"],
    linkLabel: "SCHD on its own",
    linkBlurb: "Ten years of the most-held US dividend ETF.",
    updated: "2026-09-05",
  },
];

export const PRESET_BY_SLUG: Record<string, BacktestPreset> = Object.fromEntries(
  BACKTEST_PRESETS.map((p) => [p.slug, p]),
);

/** Preset → API request. The ONE place this conversion happens. */
export function presetRequest(p: BacktestPreset): DividendBacktestRequest {
  return {
    holdings: p.holdings.map((h) => ({ symbol: h.symbol, weight: h.weight })),
    from: yearsAgoISO(p.years),
    to: todayISO(),
    initial: p.initial,
    reinvest: p.reinvest,
  };
}

/**
 * Fail the BUILD on a malformed registry rather than shipping a dead internal
 * link or an unrenderable page — same spirit as the prerender's "component not
 * registered" guard, which is what calls this.
 */
export function assertPresetGraph(): void {
  const seen = new Set<string>();
  for (const p of BACKTEST_PRESETS) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) throw new Error(`preset: bad slug "${p.slug}"`);
    if (seen.has(p.slug)) throw new Error(`preset: duplicate slug "${p.slug}"`);
    seen.add(p.slug);
    if (p.holdings.length === 0 || p.holdings.length > MAX_HOLDINGS) {
      throw new Error(`preset ${p.slug}: 1–${MAX_HOLDINGS} holdings required`);
    }
    if (p.years < 1 || p.years > MAX_YEARS) throw new Error(`preset ${p.slug}: years must be 1–${MAX_YEARS}`);
    if (p.faq.length === 0) throw new Error(`preset ${p.slug}: needs its own FAQ`);
  }
  for (const p of BACKTEST_PRESETS) {
    for (const r of p.related) {
      if (r === p.slug) throw new Error(`preset ${p.slug}: related links to itself`);
      if (!seen.has(r)) throw new Error(`preset ${p.slug}: related slug "${r}" does not exist`);
    }
  }
}
