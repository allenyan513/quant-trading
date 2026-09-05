/**
 * Per-page SEO metadata — the single source shared by the build-time prerender
 * (`prerender/`) and the client-side head update, so a crawler and a browser
 * never disagree about what this page is.
 *
 * Background: this is a one-document SPA, so `index.html` can only carry ONE set
 * of head tags. Before prerendering, every /tools/* page shipped the homepage's
 * title, description and — worst of all — `<link rel="canonical" href="/">`,
 * which invites Google to treat the tool as a duplicate of the landing page and
 * drop it. The prerender writes these tags into each route's own HTML file;
 * `applySeo` re-applies them on client-side navigation.
 *
 * Titles are kept to ~60 characters and descriptions to 140-160, the widths
 * Google renders before truncating.
 */

export const SITE_URL = "https://sweetvaluelab.com";
export const SITE_NAME = "SweetValueLab";

export interface PageSeo {
  /** Route path, no trailing slash (the canonical URL is SITE_URL + path). */
  path: string;
  title: string;
  description: string;
  /** JSON-LD nodes describing this page (schema.org). */
  jsonLd: Record<string, unknown>[];
  /** Sitemap hints. Defaults suit a tool page. */
  priority?: string;
  changefreq?: string;
}

/** Last substantive content revision. Feeds `dateModified`, which is how search
 *  and AI engines judge freshness — a rolling-data tool with no date reads as
 *  undated and gets cited less. Kept in step with the copy, not the build. */
export const CONTENT_UPDATED = "2026-09-05";

export const canonicalUrl = (path: string): string => `${SITE_URL}${path === "/" ? "/" : path}`;

/** Publisher node, referenced by every page's schema (E-E-A-T: a named entity
 *  behind the content, not an anonymous site). */
const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  description: "Equity research tools and an MCP data layer for AI assistants.",
};

export const HOME_SEO: PageSeo = {
  path: "/",
  title: "SweetValueLab — equity research your Claude can use",
  description:
    "The facts layer for AI-native equity research. Connect your Claude, research and paper-trade, and review your portfolio — all in one conversation.",
  priority: "1.0",
  changefreq: "weekly",
  jsonLd: [
    ORGANIZATION,
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

/** The FAQ schema must mirror the FAQ rendered on the page — Google requires the
 *  answer to be visible to the reader, not schema-only. Keep the two in step. */
const BACKTEST_FAQ: Array<[string, string]> = [
  [
    "Do I need an account to backtest a dividend portfolio?",
    "No. Nothing here is gated, and results live in the URL — copy the link to share a run.",
  ],
  [
    "Which tickers work?",
    "US-listed stocks, ETFs and REITs. If a symbol has no dividend history, it still backtests — it just contributes price return only.",
  ],
  [
    "Why does my start date move?",
    "The test needs every holding to have prices. Add a fund that launched in 2020 and the window starts in 2020, with a note saying so.",
  ],
  [
    "Are taxes and fees included?",
    "No. Returns are gross: no withholding on dividends, no commissions, no fund fees beyond those already inside an ETF's price.",
  ],
  ["How far back can I go?", "Ten years, which covers the history most dividend ETFs actually have."],
];

export const DIVIDEND_BACKTEST_SEO: PageSeo = {
  path: "/tools/dividend-portfolio-backtest",
  title: "Dividend Portfolio Backtest — Free, No Sign-Up",
  description:
    "Backtest a dividend portfolio on daily prices: total return with and without reinvestment, income by year, yield on cost, and dividend cuts.",
  jsonLd: [
    ORGANIZATION,
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/tools/dividend-portfolio-backtest#app`,
      name: "Dividend Portfolio Backtest",
      url: `${SITE_URL}/tools/dividend-portfolio-backtest`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      publisher: { "@id": `${SITE_URL}/#organization` },
      description:
        "Backtest a basket of dividend stocks or ETFs on daily split-adjusted prices, comparing dividend reinvestment against taking the cash.",
      featureList: [
        "Total return with and without dividend reinvestment",
        "Dividend income by calendar year and income growth rate",
        "Yield on cost",
        "Maximum drawdown and annualized volatility on daily bars",
        "Dividend cuts by holding",
        "Shareable result URLs",
      ],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      dateModified: CONTENT_UPDATED,
      isAccessibleForFree: true,
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/tools/dividend-portfolio-backtest#faq`,
      mainEntity: BACKTEST_FAQ.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

/** About / Privacy / Terms — verifiable identity behind the tools. Search and AI
 *  engines treat a site with no reachable operator as lower-trust, and a finance
 *  tool with no stated limits deserves that reading. */
const textPage = (path: string, title: string, description: string, type: string): PageSeo => ({
  path,
  title,
  description,
  priority: "0.3",
  changefreq: "yearly",
  jsonLd: [
    ORGANIZATION,
    {
      "@type": type,
      "@id": `${SITE_URL}${path}#page`,
      url: `${SITE_URL}${path}`,
      name: title,
      description,
      dateModified: CONTENT_UPDATED,
      publisher: { "@id": `${SITE_URL}/#organization` },
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
  ],
});

export const ABOUT_SEO = textPage(
  "/about",
  "About SweetValueLab — who builds these tools",
  "Who runs SweetValueLab, where its market and filing data comes from, how the tools compute their numbers, and what the site explicitly is not.",
  "AboutPage",
);

export const PRIVACY_SEO = textPage(
  "/privacy",
  "Privacy Policy — SweetValueLab",
  "What SweetValueLab stores and what it does not. The free tools need no account and keep nothing; there are no analytics or tracking scripts.",
  "WebPage",
);

export const TERMS_SEO = textPage(
  "/terms",
  "Terms of Use — SweetValueLab",
  "Terms for using SweetValueLab: research and educational use only, not investment advice, hypothetical backtests, fair use, and no warranty on data.",
  "WebPage",
);

/** Every route the prerender emits and the sitemap lists. */
export const PUBLIC_PAGES: PageSeo[] = [HOME_SEO, DIVIDEND_BACKTEST_SEO, ABOUT_SEO, PRIVACY_SEO, TERMS_SEO];

/**
 * Client-side head update, for a route reached by in-app navigation (the
 * prerendered file only covers a cold load). Tags are created if the shell
 * doesn't already carry them, so this works no matter which HTML file was served.
 */
export function applySeo(seo: PageSeo): void {
  if (typeof document === "undefined") return;
  const url = canonicalUrl(seo.path);
  document.title = seo.title;
  upsert("meta", 'meta[name="description"]', { name: "description" }, "content", seo.description);
  upsert("link", 'link[rel="canonical"]', { rel: "canonical" }, "href", url);
  upsert("meta", 'meta[property="og:title"]', { property: "og:title" }, "content", seo.title);
  upsert("meta", 'meta[property="og:description"]', { property: "og:description" }, "content", seo.description);
  upsert("meta", 'meta[property="og:url"]', { property: "og:url" }, "content", url);
}

function upsert(
  tag: "meta" | "link",
  selector: string,
  create: Record<string, string>,
  attr: string,
  value: string,
): void {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    for (const [k, v] of Object.entries(create)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}
