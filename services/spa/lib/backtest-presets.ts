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
 * in `pages/tools/portfolio-backtest/presets/<slug>.tsx`.
 */
import type { FaqEntry } from "@/lib/seo";
import type { DividendBacktestRequest } from "@/lib/backtest";
import { MAX_HOLDINGS, MAX_YEARS, todayISO, yearsAgoISO } from "@/lib/backtest";

export const TOOL_PATH = "/tools/portfolio-backtest";

/**
 * Slug → path. THE only place this conversion happens, which is why changing the
 * URL shape is a one-function edit: routes, the prerender's COMPONENTS map,
 * PUBLIC_PAGES/sitemap and every internal link all read through here.
 *
 * Comparisons live under `/compare/` so a ticker slug and a comparison slug can
 * never collide — and the slug itself stays flat (`schd-vs-vym`), because
 * `assertPresetGraph`'s slug rule forbids a slash and a path segment is not the
 * preset's identity.
 */
export const presetPath = (p: BacktestPreset): string =>
  p.kind === "comparison" ? `${TOOL_PATH}/compare/${p.slug}` : `${TOOL_PATH}/${p.slug}`;

export interface PresetHolding {
  symbol: string;
  /** Percent. The API normalizes anyway, but keep these summing to 100 so the
   *  weights shown on the page match what the copy says. */
  weight: number;
}

/** One row of the at-a-glance fund table. `values` aligns with `holdings` order. */
export interface PresetFact {
  readonly label: string;
  readonly values: readonly string[];
}

/**
 * The shelf a preset sits on in the hub.
 *
 * Someone who arrived on "what would NVDA have done" and someone who arrived on
 * "SCHD vs VYM" want different things, and a single undifferentiated list makes
 * both of them read the whole thing to find their half. The grouping is also what
 * keeps the list legible as it grows past a screenful.
 */
export type PresetCategory = "index" | "single-stock" | "portfolio" | "dividend";

/** Display order and copy for the shelves. Index first: it is what most visitors
 *  are implicitly comparing everything else against. */
export const PRESET_CATEGORIES: ReadonlyArray<{
  readonly id: PresetCategory;
  readonly label: string;
  readonly blurb: string;
}> = [
  { id: "index", label: "Index funds", blurb: "The broad-market baselines, and how they differ from each other." },
  { id: "single-stock", label: "Single stocks", blurb: "One company, held through everything — including the drawdowns." },
  { id: "portfolio", label: "Classic portfolios", blurb: "Well-known allocations, run as someone holding them would have experienced." },
  { id: "dividend", label: "Dividend & income", blurb: "Funds bought for the payout: what they paid, and whether it grew." },
];

export interface BacktestPreset {
  /** URL segment: lowercase, hyphens. Frozen once published — a live URL is a
   *  promise to everyone who linked it. */
  readonly slug: string;
  readonly kind: "comparison" | "basket";
  /** Which shelf in the hub. Required — an untagged preset would silently vanish
   *  from a grouped list, which `assertPresetGraph()` refuses to let happen. */
  readonly category: PresetCategory;
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

  /** Side-by-side fund facts. Hand-verified, deliberately limited to things that
   *  barely move (index rules, weighting, fee) plus counts stamped with `updated`.
   *  This is STATIC — it lands in the prerendered HTML with no API call, so it is
   *  the part of the page a non-JS crawler can actually read. */
  readonly facts?: readonly PresetFact[];

  /** Reference line, default `"SPY"`. Set `null` to suppress it — and it is
   *  skipped automatically when the benchmark is already one of the holdings, so
   *  the SPY page does not get compared against itself. */
  readonly benchmark?: string | null;

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
    slug: "dividend",
    kind: "basket",
    category: "dividend",
    holdings: [{ symbol: "SCHD", weight: 60 }, { symbol: "VYM", weight: 40 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "Dividend Portfolio Backtest — Free, No Sign-Up",
    description:
      "Backtest a dividend portfolio on daily prices: total return with and without reinvestment, income every year, yield on cost, and dividend cuts.",
    h1: "Dividend portfolio backtest",
    intro:
      "A dividend basket run through ten years of real history — not just what it returned, but what it paid out each year, and whether that payment grew.",
    faq: [
      [
        "What does a dividend portfolio backtest tell me that a return chart doesn't?",
        "The income. A return chart collapses everything into one number; the year-by-year table below shows what the basket actually paid on your starting amount each year, which is the thing an income investor is building toward.",
      ],
      [
        "Should I reinvest the dividends?",
        "The chart plots both, and the gap between the lines is the answer for this particular basket over this particular window. Reinvested shares collect the next dividend, which buys more shares — over a decade that compounding is usually the larger part of the difference.",
      ],
      [
        "What is yield on cost?",
        "The last twelve months of income measured against what you originally invested, rather than against today's price. With dividends reinvested it also carries the shares you accumulated, so it runs well ahead of any fund's quoted yield.",
      ],
      [
        "Can I use my own tickers?",
        "Yes — this page is a ready-made basket, but the full tool takes any tickers and weights you like, over any window up to twenty years.",
      ],
    ],
    related: ["schd", "schd-vs-vym"],
    linkLabel: "Dividend basket",
    linkBlurb: "A dividend portfolio over ten years, income and all.",
    updated: "2026-09-06",
  },
  {
    slug: "spy",
    kind: "basket",
    category: "index",
    holdings: [{ symbol: "SPY", weight: 100 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    // SPY is the benchmark; comparing it with itself is a flat line at zero.
    benchmark: null,
    title: "SPY Backtest: 10 Years, Dividends Reinvested",
    description:
      "Backtest SPY over ten years on daily prices: total return, CAGR, the deepest drawdown you had to sit through, and what reinvesting the dividends was worth.",
    h1: "SPY backtest: ten years of the S&P 500",
    intro:
      "What $10,000 in the SPDR S&P 500 ETF did over the last decade, measured on daily closes — including the part most summaries leave out: how much of it came from dividends.",
    faq: [
      [
        "How much of SPY's return comes from dividends?",
        "Less than most people assume, but not nothing — the summary below states it as a share of the total gain for this window. The S&P 500's yield is low, yet reinvested over a decade it still compounds into a meaningful slice of the ending balance.",
      ],
      [
        "Why is the drawdown here bigger than the one I see elsewhere?",
        "It is measured on daily closes, so it is the real peak-to-trough you lived through. Month-end data smooths away the worst days and reports a smaller number. Conversely, since-inception drawdowns quoted elsewhere cover 1993 onward and include crashes outside this ten-year window.",
      ],
      [
        "Does this include the fund's fee?",
        "SPY's 0.09% expense ratio is already inside its price, so yes. Taxes and commissions are not — returns here are gross.",
      ],
    ],
    facts: [
      { label: "Index tracked", values: ["S&P 500"] },
      { label: "What it holds", values: ["The 500 largest US companies, weighted by market cap"] },
      { label: "Holdings", values: ["505"] },
      { label: "Expense ratio", values: ["0.09%"] },
      { label: "Pays", values: ["Quarterly"] },
      { label: "Launched", values: ["January 1993"] },
    ],
    related: ["qqq", "spy-vs-qqq"],
    linkLabel: "SPY on its own",
    linkBlurb: "Ten years of the S&P 500, dividends included.",
    updated: "2026-09-06",
  },
  {
    slug: "qqq",
    kind: "basket",
    category: "index",
    holdings: [{ symbol: "QQQ", weight: 100 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "QQQ Backtest: 10 Years vs the S&P 500",
    description:
      "Backtest QQQ over ten years of daily prices: total return, CAGR, the deepest drawdown you had to sit through, and how far it ran ahead of the S&P 500.",
    h1: "QQQ backtest: ten years, against the S&P 500",
    intro:
      "What $10,000 in the Invesco QQQ Trust did over the last decade — and, because the number only means something in context, the same $10,000 in the S&P 500 alongside it.",
    faq: [
      [
        "Did QQQ beat the S&P 500?",
        "Over this window, yes — the \u201cvs S&P 500\u201d figure below is the annualized difference. What that figure cannot tell you is whether the next decade rhymes: QQQ is a concentrated bet on one exchange's largest listings, and its lead comes and goes with that concentration.",
      ],
      [
        "How much extra risk did that come with?",
        "Compare the maximum drawdown and the annualized volatility rows against the benchmark. Both are computed on daily closes, so the drawdown is the real peak-to-trough rather than the gentler month-end version.",
      ],
      [
        "Does QQQ pay a dividend?",
        "A small one. It is reported here as a share of the total gain rather than as a full income table, because on a fund yielding well under one percent an eleven-row income breakdown would be small change dressed up as a finding.",
      ],
    ],
    facts: [
      { label: "Index tracked", values: ["NASDAQ 100"] },
      { label: "What it holds", values: ["The 100 largest non-financial companies listed on Nasdaq"] },
      { label: "Holdings", values: ["105"] },
      { label: "Expense ratio", values: ["0.18%"] },
      { label: "Pays", values: ["Quarterly"] },
      { label: "Launched", values: ["March 1999"] },
    ],
    related: ["spy", "spy-vs-qqq"],
    linkLabel: "QQQ on its own",
    linkBlurb: "Ten years of the Nasdaq 100, against the S&P.",
    updated: "2026-09-06",
  },
  {
    slug: "spy-vs-qqq",
    kind: "comparison",
    category: "index",
    holdings: [{ symbol: "SPY", weight: 50 }, { symbol: "QQQ", weight: 50 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    // One of the subjects IS the S&P 500, so the benchmark leg would duplicate it.
    benchmark: null,
    title: "SPY vs QQQ: 10-Year Backtest",
    description:
      "SPY vs QQQ over ten years with dividends reinvested: total return, CAGR, the drawdown each one put you through, and why the window you pick changes the answer.",
    h1: "SPY vs QQQ: a 10-year backtest",
    intro:
      "The broadest US index fund against the most concentrated large-cap one, run side by side through the same decade on daily prices.",
    faq: [
      [
        "Which has performed better, SPY or QQQ?",
        "Over the last ten years QQQ, by a wide margin — the table below gives the exact figures. But that decade was unusually kind to large-cap technology, which is most of what QQQ owns, so the result is as much a statement about the window as about the funds.",
      ],
      [
        "Why do other sites quote much bigger drawdowns?",
        "Because they measure since inception. QQQ launched in 1999 and fell more than 80% in the dot-com bust; SPY dates to 1993. Over the last ten years both fell far less. Neither number is wrong — they answer different questions, which is exactly why the window matters.",
      ],
      [
        "Should I hold both?",
        "They overlap heavily: QQQ's largest holdings are also SPY's largest holdings. Holding both mostly increases your weight in the same handful of companies rather than diversifying you. Run each on its own above and see whether the blend actually changes anything.",
      ],
    ],
    facts: [
      { label: "Index tracked", values: ["S&P 500", "NASDAQ 100"] },
      {
        label: "What it holds",
        values: ["The 500 largest US companies, weighted by market cap", "The 100 largest non-financial Nasdaq listings"],
      },
      { label: "Holdings", values: ["505", "105"] },
      { label: "Expense ratio", values: ["0.09%", "0.18%"] },
      { label: "Pays", values: ["Quarterly", "Quarterly"] },
      { label: "Launched", values: ["January 1993", "March 1999"] },
    ],
    related: ["spy", "qqq"],
    linkLabel: "SPY vs QQQ",
    linkBlurb: "The whole market against the Nasdaq 100.",
    updated: "2026-09-06",
  },
  {
    slug: "schd-vs-vym",
    kind: "comparison",
    category: "dividend",
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
    ],
    facts: [
      { label: "Index tracked", values: ["Dow Jones U.S. Dividend 100", "FTSE Custom High Dividend Yield"] },
      {
        label: "How it selects",
        values: [
          "10+ consecutive years of dividends, then ranked on cash flow to debt, return on equity, yield and 5-year dividend growth",
          "The higher-yielding half of US dividend payers, by forecast yield",
        ],
      },
      { label: "Holdings", values: ["103", "615"] },
      { label: "Weighting", values: ["Modified market cap, with per-stock and per-sector caps", "Market cap"] },
      { label: "Expense ratio", values: ["0.06%", "0.04%"] },
      { label: "Pays", values: ["Quarterly", "Quarterly"] },
      { label: "Launched", values: ["October 2011", "November 2006"] },
    ],
    related: ["schd", "jepi-vs-schd", "dividend"],
    linkLabel: "SCHD vs VYM",
    linkBlurb: "Quality screen versus pure high yield, over ten years.",
    updated: "2026-09-05",
  },
  {
    slug: "jepi-vs-schd",
    kind: "comparison",
    category: "dividend",
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
    facts: [
      { label: "Management", values: ["Actively managed", "Rules-based index fund"] },
      {
        label: "What it holds",
        values: [
          "Large-cap US stocks plus equity-linked notes that sell S&P 500 calls",
          "About 100 US companies with 10+ years of dividends",
        ],
      },
      { label: "Where the payout comes from", values: ["Mostly option premium", "Dividends declared by the holdings"] },
      { label: "Holdings", values: ["136", "103"] },
      { label: "Pays", values: ["Monthly", "Quarterly"] },
      { label: "Expense ratio", values: ["0.35%", "0.06%"] },
      { label: "Launched", values: ["May 2020", "October 2011"] },
    ],
    related: ["schd-vs-vym", "schd"],
    linkLabel: "JEPI vs SCHD",
    linkBlurb: "Covered-call income against dividend growth.",
    updated: "2026-09-05",
  },
  {
    slug: "schd",
    kind: "basket",
    category: "dividend",
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
    facts: [
      { label: "Index tracked", values: ["Dow Jones U.S. Dividend 100"] },
      {
        label: "How it selects",
        values: [
          "10+ consecutive years of dividends, then ranked on cash flow to debt, return on equity, yield and 5-year dividend growth",
        ],
      },
      { label: "Holdings", values: ["103"] },
      { label: "Weighting", values: ["Modified market cap, with per-stock and per-sector caps"] },
      { label: "Expense ratio", values: ["0.06%"] },
      { label: "Pays", values: ["Quarterly"] },
      { label: "Launched", values: ["October 2011"] },
    ],
    related: ["schd-vs-vym", "jepi-vs-schd", "spy"],
    linkLabel: "SCHD on its own",
    linkBlurb: "Ten years of the most-held US dividend ETF.",
    updated: "2026-09-05",
  },
  {
    slug: "nvda",
    kind: "basket",
    category: "single-stock",
    holdings: [{ symbol: "NVDA", weight: 100 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "NVDA Backtest: 10 Years of NVIDIA",
    description:
      "Backtest NVIDIA over ten years of daily closes: total return, CAGR, and the peak-to-trough drawdowns a holder had to sit through to collect it.",
    h1: "NVDA backtest: ten years of NVIDIA",
    intro:
      "What a lump sum in NVIDIA would have done over the last decade, measured on daily closes — including the drawdowns along the way, which is the part a headline return never shows.",
    faq: [
      [
        "Does this account for NVIDIA's stock splits?",
        "Yes. Prices here are split-adjusted, so the curve runs continuously through the 4-for-1 in July 2021 and the 10-for-1 in June 2024. A raw price chart shows two cliffs on those dates that nobody holding the shares actually experienced.",
      ],
      [
        "Why is the drawdown so much larger than the S&P 500's?",
        "Because it is one company, not five hundred. A single semiconductor stock carries the industry's cycle with nothing to average it out, and the figure below is measured on daily closes — the real peak-to-trough, not the smoothed month-end version.",
      ],
      [
        "Do NVIDIA's dividends matter here?",
        "Barely. NVIDIA pays a token quarterly dividend and the summary below states its share of the total gain. On a position that moved this much the payout is a rounding error — the mirror image of the dividend funds elsewhere on this site.",
      ],
    ],
    facts: [
      { label: "Sector", values: ["Semiconductors"] },
      { label: "Listed", values: ["January 1999, NASDAQ"] },
      { label: "Recent splits", values: ["4-for-1 (Jul 2021), 10-for-1 (Jun 2024)"] },
      { label: "Pays", values: ["A token quarterly dividend"] },
    ],
    related: ["nvda-vs-spy", "tsla", "magnificent-7"],
    linkLabel: "NVDA on its own",
    linkBlurb: "Ten years of NVIDIA, drawdowns included.",
    updated: "2026-09-06",
  },
  {
    slug: "tsla",
    kind: "basket",
    category: "single-stock",
    holdings: [{ symbol: "TSLA", weight: 100 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "TSLA Backtest: 10 Years of Tesla",
    description:
      "Backtest Tesla over ten years of daily closes: total return, CAGR, volatility, and the deepest peak-to-trough fall a holder had to sit through.",
    h1: "TSLA backtest: ten years of Tesla",
    intro:
      "Tesla over the last decade on daily closes. Tesla pays no dividend, so every bit of this is price — which makes it the cleanest illustration on the site of what holding a single volatile stock actually felt like.",
    faq: [
      [
        "Tesla pays no dividend — does this tool still work?",
        "Yes, and the result says so explicitly. With no payout there is nothing to reinvest, so the two lines on the chart sit on top of each other and the entire return is price. That is the point of running it here: the contrast with the dividend funds is the lesson.",
      ],
      [
        "Are the 2020 and 2022 splits handled?",
        "Yes. Prices are split-adjusted, so the 5-for-1 in August 2020 and the 3-for-1 in August 2022 do not appear as drops. Share counts in the result are stated on today's split-adjusted basis.",
      ],
      [
        "Why does the volatility figure look so high?",
        "It is annualized from daily returns of one company. Index funds average thousands of daily moves against each other; a single stock does not, and Tesla has been among the more volatile large caps for its whole listed life.",
      ],
    ],
    facts: [
      { label: "Sector", values: ["Auto manufacturers"] },
      { label: "Listed", values: ["June 2010, NASDAQ"] },
      { label: "Splits", values: ["5-for-1 (Aug 2020), 3-for-1 (Aug 2022)"] },
      { label: "Pays", values: ["No dividend"] },
    ],
    related: ["nvda", "magnificent-7", "spy"],
    linkLabel: "TSLA on its own",
    linkBlurb: "Ten years of Tesla — all price, no dividend.",
    updated: "2026-09-06",
  },
  {
    slug: "aapl",
    kind: "basket",
    category: "single-stock",
    holdings: [{ symbol: "AAPL", weight: 100 }],
    years: 20,
    initial: 10_000,
    reinvest: true,
    title: "AAPL Backtest: 20 Years of Apple",
    description:
      "Backtest Apple across two decades of daily closes: total return, CAGR, the deepest drawdown, and what the dividend added after it was reinstated in 2012.",
    h1: "AAPL backtest: twenty years of Apple",
    intro:
      "Apple over the longest window this tool offers. Two decades is long enough to contain a company that paid nothing for the first half of it and has paid every quarter since — so the income table here reads very differently at the two ends.",
    faq: [
      [
        "Why does this window start in October rather than exactly twenty years ago?",
        "The daily price series reaches back a little under twenty years, and the test refuses to invent the missing weeks. It starts at the first date real prices exist and states that date in the result rather than quietly padding the window.",
      ],
      [
        "Apple paid no dividend for years — how is that handled?",
        "Exactly as it happened: nothing to reinvest until the payout resumed in 2012, then a quarterly dividend from there. The year-by-year income table below shows the gap, which is the honest picture a flat yield figure erases.",
      ],
      [
        "Do the 2014 and 2020 splits distort the result?",
        "No. Prices are split-adjusted, so the 7-for-1 in June 2014 and the 4-for-1 in August 2020 pass through without a step. Dividends are matched to the same adjusted basis, so per-share income stays comparable across them.",
      ],
    ],
    facts: [
      { label: "Sector", values: ["Consumer electronics"] },
      { label: "Listed", values: ["December 1980, NASDAQ"] },
      { label: "Splits in window", values: ["2-for-1 (2005), 7-for-1 (2014), 4-for-1 (2020)"] },
      { label: "Pays", values: ["Quarterly, resumed 2012"] },
    ],
    related: ["nvda", "magnificent-7", "spy"],
    linkLabel: "AAPL over twenty years",
    linkBlurb: "The longest window here — before and after the dividend came back.",
    updated: "2026-09-06",
  },
  {
    slug: "nvda-vs-spy",
    kind: "comparison",
    category: "single-stock",
    holdings: [{ symbol: "NVDA", weight: 50 }, { symbol: "SPY", weight: 50 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    benchmark: null,
    title: "NVDA vs S&P 500: 10-Year Backtest",
    description:
      "One semiconductor company against the whole US market over ten years: total return, CAGR, drawdown and volatility for NVIDIA and SPY side by side.",
    h1: "NVDA vs the S&P 500",
    intro:
      "The same money, the same decade, in one stock and in five hundred. This page is less about which number is bigger than about what the second and third rows cost you to earn the first.",
    faq: [
      [
        "Is comparing one stock to an index fair?",
        "It is the comparison people actually make, so it is worth doing properly. What it shows is not just the return gap but the risk gap: look at the drawdown and volatility rows before the return row, because those are what a holder had to live with.",
      ],
      [
        "NVIDIA is inside the S&P 500 — does that double-count?",
        "No. The two columns are independent backtests: one buys only NVIDIA, the other buys SPY. NVIDIA's weight inside the index does mean the right-hand column is not fully independent of the left, which is itself worth knowing.",
      ],
      [
        "Does this prove picking stocks beats indexing?",
        "It proves nothing of the sort. This is one company chosen with hindsight over one window that happened to suit it. The honest use of this page is the shape of the two curves and the depth of the two drawdowns, not the ending balances.",
      ],
    ],
    facts: [
      { label: "What you own", values: ["One semiconductor company", "The 500 largest US companies"] },
      { label: "Expense ratio", values: ["None — a stock", "0.09%"] },
      { label: "Pays", values: ["A token quarterly dividend", "Quarterly"] },
    ],
    related: ["nvda", "spy", "spy-vs-qqq"],
    linkLabel: "NVDA vs S&P 500",
    linkBlurb: "One stock against the whole market — and what it cost in drawdown.",
    updated: "2026-09-06",
  },
  {
    slug: "magnificent-7",
    kind: "basket",
    category: "portfolio",
    holdings: [
      { symbol: "AAPL", weight: 14.3 },
      { symbol: "MSFT", weight: 14.3 },
      { symbol: "GOOGL", weight: 14.3 },
      { symbol: "AMZN", weight: 14.3 },
      { symbol: "NVDA", weight: 14.3 },
      { symbol: "META", weight: 14.3 },
      { symbol: "TSLA", weight: 14.2 },
    ],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "Magnificent 7 Backtest vs the S&P 500",
    description:
      "Backtest an equal-weight Magnificent Seven basket over ten years against the S&P 500: total return, CAGR, drawdown, and the drift away from equal weight.",
    h1: "Magnificent 7 backtest",
    intro:
      "The seven megacaps held in equal weight for a decade, benchmarked against the S&P 500 that contains them. Bought once and never rebalanced, which is what makes the weights at the end so different from the weights at the start.",
    faq: [
      [
        "Is this rebalanced back to equal weight?",
        "No, and that matters more than it sounds. The basket is bought once in equal weights and held, so the winners grow into a larger share every year. The per-holding table below shows where each name ended up, which is the real shape of the portfolio by the end.",
      ],
      [
        "Isn't the S&P 500 benchmark already mostly these same companies?",
        "Increasingly so, which is the interesting part. The index holds them at market-cap weight alongside four hundred and ninety-odd others, so the gap between the two lines is what concentration bought — and, in the drawdown row, what it cost.",
      ],
      [
        "Two of these pay no dividend — how is the income handled?",
        "Per holding, as it happened. Amazon and Tesla contribute price only; the others pay on their own schedules and their dividends are reinvested. The result flags which names paid nothing rather than averaging the gap away.",
      ],
      [
        "Why start ten years ago rather than at each company's listing?",
        "Because the window has to be one every holding shares — the test starts where the youngest series begins. Meta listed in 2012, so ten years is comfortably inside the range for all seven.",
      ],
    ],
    facts: [
      { label: "Holdings", values: ["AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA"] },
      { label: "Weighting", values: ["Equal at purchase, then left to drift"] },
      { label: "Rebalancing", values: ["None"] },
      { label: "Non-payers", values: ["AMZN and TSLA pay no dividend"] },
    ],
    related: ["nvda", "tsla", "spy"],
    linkLabel: "Magnificent 7",
    linkBlurb: "The seven megacaps, equal weight, against the index that holds them.",
    updated: "2026-09-06",
  },
  {
    slug: "sixty-forty",
    kind: "basket",
    category: "portfolio",
    holdings: [{ symbol: "SPY", weight: 60 }, { symbol: "BND", weight: 40 }],
    years: 20,
    initial: 10_000,
    reinvest: true,
    benchmark: null,
    title: "60/40 Portfolio Backtest — 20 Years",
    description:
      "Backtest the classic 60/40 stock and bond portfolio across two decades of daily prices: total return, CAGR, and how much the bonds actually cut the drawdown.",
    h1: "60/40 portfolio backtest",
    intro:
      "Sixty percent US stocks, forty percent US investment-grade bonds, bought once and held for two decades. The question this page answers is not what it returned but what the bond half did to the worst stretch.",
    faq: [
      [
        "What does the 40% in bonds actually buy?",
        "A shallower hole. Compare the max drawdown here with the all-stock pages on this site — that difference is the entire argument for the allocation, and it is a far more useful number than the return.",
      ],
      [
        "Is this rebalanced back to 60/40 each year?",
        "No. It is bought once and held, so the stock share grows through a long bull market and the mix at the end is not the mix at the start. A rebalanced version would have sold stocks into strength and held a steadier risk profile; this one shows the drift.",
      ],
      [
        "Why does the window start in 2007 rather than twenty years ago?",
        "BND launched in April 2007, and the test only runs over dates every holding has prices. It starts there and says so rather than filling in a bond series that did not exist yet.",
      ],
      [
        "Are the bond fund's distributions included?",
        "Yes — BND pays monthly, and those payments are reinvested exactly like a stock dividend. Over twenty years that reinvested coupon is a large share of what the bond half contributed.",
      ],
    ],
    facts: [
      { label: "Holdings", values: ["SPY 60% / BND 40%"] },
      { label: "What BND holds", values: ["US investment-grade bonds, roughly 3,600 issues"] },
      { label: "Expense ratios", values: ["SPY 0.09%, BND 0.03%"] },
      { label: "Rebalancing", values: ["None — bought once and held"] },
    ],
    related: ["spy", "magnificent-7", "dividend"],
    linkLabel: "60/40 stocks and bonds",
    linkBlurb: "The classic allocation over twenty years — and what the bonds saved.",
    updated: "2026-09-06",
  },
  {
    slug: "voo-vs-vti",
    kind: "comparison",
    category: "index",
    holdings: [{ symbol: "VOO", weight: 50 }, { symbol: "VTI", weight: 50 }],
    years: 10,
    initial: 10_000,
    reinvest: true,
    title: "VOO vs VTI: 10-Year Backtest",
    description:
      "The S&P 500 against the total US market over ten years. Same fee, same manager, 505 holdings versus about 3,600 — here is what that difference was worth.",
    h1: "VOO vs VTI",
    intro:
      "Two Vanguard funds that most portfolios treat as interchangeable, run side by side for a decade. They charge the same fee and overlap heavily, so this page is really about how much the extra three thousand smaller companies changed the outcome.",
    faq: [
      [
        "What is actually different between VOO and VTI?",
        "Coverage. VOO holds the S&P 500; VTI holds essentially the entire US market, around 3,600 companies, at market-cap weight. Because the weighting is by size, the extra names are small caps that together make up a modest slice — which is why the two curves track so closely.",
      ],
      [
        "If they are this similar, does the choice matter?",
        "Less than most fund debates suggest, and this page is the evidence. The rows worth reading are drawdown and volatility rather than return: if adding thousands of smaller companies barely moves either, the decision is closer to a coin flip than a strategy.",
      ],
      [
        "Do they cost the same?",
        "Both charge 0.03%, so fee is not the tiebreaker it often is. Neither is the manager — both are Vanguard index funds tracking rules-based benchmarks with no discretion.",
      ],
      [
        "Should I hold both?",
        "Holding both mostly buys overlap: every VOO holding is already inside VTI. That is not advice, but it is a fact about what the two funds contain, and this page is here so the decision can be made on measurements rather than on the fund names.",
      ],
    ],
    facts: [
      { label: "Index tracked", values: ["S&P 500", "CRSP US Total Market"] },
      { label: "Holdings", values: ["505", "About 3,600"] },
      { label: "Expense ratio", values: ["0.03%", "0.03%"] },
      { label: "Launched", values: ["September 2010", "May 2001"] },
    ],
    related: ["spy-vs-qqq", "spy", "qqq"],
    linkLabel: "VOO vs VTI",
    linkBlurb: "S&P 500 against the total market — same fee, 3,000 more companies.",
    updated: "2026-09-06",
  },
];

export const PRESET_BY_SLUG: Record<string, BacktestPreset> = Object.fromEntries(
  BACKTEST_PRESETS.map((p) => [p.slug, p]),
);

export const DEFAULT_BENCHMARK = "SPY";

/**
 * The benchmark request for a preset, or null when it would be redundant.
 * Same window and amount as the subject, so the lines are comparable.
 */
export function presetBenchmarkRequest(p: BacktestPreset): DividendBacktestRequest | null {
  const symbol = p.benchmark === undefined ? DEFAULT_BENCHMARK : p.benchmark;
  if (!symbol) return null;
  if (p.holdings.some((h) => h.symbol.toUpperCase() === symbol.toUpperCase())) return null;
  return { ...presetRequest(p), holdings: [{ symbol, weight: 100 }] };
}

/** One request per holding, each at 100% weight — what a comparison page needs:
 *  a curve for EACH fund, not one curve for a blend of them. */
export function presetRequestPerHolding(p: BacktestPreset): DividendBacktestRequest[] {
  const base = presetRequest(p);
  return p.holdings.map((h) => ({ ...base, holdings: [{ symbol: h.symbol, weight: 100 }] }));
}

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
    if (!PRESET_CATEGORIES.some((c) => c.id === p.category)) {
      throw new Error(`preset ${p.slug}: unknown category "${p.category}"`);
    }
    // The hub renders shelf by shelf, so a preset in a category with no shelf would
    // be prerendered and then linked from nowhere — invisible to a crawler.
    if (p.title.length > 60) throw new Error(`preset ${p.slug}: title is ${p.title.length} chars, max 60`);
    if (p.description.length < 140 || p.description.length > 160) {
      throw new Error(`preset ${p.slug}: description is ${p.description.length} chars, must be 140–160`);
    }
  }
  for (const p of BACKTEST_PRESETS) {
    for (const r of p.related) {
      if (r === p.slug) throw new Error(`preset ${p.slug}: related links to itself`);
      if (!seen.has(r)) throw new Error(`preset ${p.slug}: related slug "${r}" does not exist`);
    }
  }
}
