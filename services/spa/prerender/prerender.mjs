/**
 * Post-build prerender: turn each public route into a real HTML file.
 *
 * Cloudflare Pages serves a matching static asset before it consults `_redirects`,
 * so `dist/tools/portfolio-backtest/index.html` answers that path directly
 * and the SPA fallback (`/* /index.html 200`) still covers every other route.
 *
 * What a crawler gets afterwards: the route's own title/description/canonical/og,
 * its JSON-LD, its H1 and its full copy — instead of the homepage's head tags and
 * an empty <div id="root">.
 *
 * Naming matters: `<path>.html`, never `<path>/index.html`. Verified against
 * `wrangler pages dev` — Pages serves the `.html` sibling at the clean path
 * directly (200, no hop), while a directory index costs a 308 to the trailing-slash
 * form, which would also make each page's canonical URL a redirect target. Do NOT
 * add an explicit `_redirects` rule for these paths either: Pages strips `.html`
 * with a 308, so a `/tools/x -> /tools/x.html 200` rule becomes a redirect loop.
 * The SPA catch-all in public/_redirects still covers every client-routed path.
 *
 * Also emits sitemap.xml from the same PUBLIC_PAGES list, so adding a tool can't
 * silently leave the sitemap behind.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

const { renderRoute, PUBLIC_PAGES, BLOG_FEEDS } = await import(join(root, "dist-ssr/entry-server.js"));

const SITE_URL = "https://sweetvaluelab.com";
const canonical = (path) => `${SITE_URL}${path}`;

const shell = readFileSync(join(dist, "index.html"), "utf8");
// The opening marker carries an explanatory comment, so match on the prefix.
const SEO_BLOCK = /<!-- seo:start[\s\S]*?seo:end -->/;
const ROOT_DIV = '<div id="root"></div>';
if (!SEO_BLOCK.test(shell)) throw new Error("prerender: index.html is missing the seo:start/seo:end block");
if (!shell.includes(ROOT_DIV)) throw new Error(`prerender: index.html is missing ${ROOT_DIV}`);

/** og:locale wants `language_TERRITORY`, which is not the same vocabulary as
 *  `hreflang`/`<html lang>` (BCP-47). Mapped explicitly rather than string-mangled. */
const OG_LOCALE = { en: "en_US", "zh-Hans": "zh_CN" };

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const buildDate = new Date().toISOString().slice(0, 10);

function headFor(page) {
  const url = canonical(page.path);
  const graph = { "@context": "https://schema.org", "@graph": page.jsonLd };
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${page.ogType ?? "website"}" />`,
    `<meta property="og:site_name" content="SweetValueLab" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[page.lang ?? "en"] ?? "en_US"}" />`,
    `<meta name="twitter:card" content="summary" />`,
    // Translations. Each edition lists them ALL, itself included — Google verifies
    // that an alternate points back, and drops a one-way annotation.
    ...(page.alternates ?? []).map(
      (alt) => `<link rel="alternate" hreflang="${alt.hreflang}" href="${canonical(alt.path)}" />`,
    ),
    ...(page.published ? [`<meta property="article:published_time" content="${page.published}" />`] : []),
    ...(page.modified ? [`<meta property="article:modified_time" content="${page.modified}" />`] : []),
    ...(page.feed
      ? [
          `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(page.feed.title)}" href="${canonical(
            page.feed.path,
          )}" />`,
        ]
      : []),
    // JSON-LD closes with </script>, which cannot appear inside the string.
    `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

for (const page of PUBLIC_PAGES) {
  const html = shell
    .replace(SEO_BLOCK, headFor(page))
    // A page serving Chinese while declaring `lang="en"` is not cosmetic: it is a
    // wrong-language signal to search, the wrong voice in a screen reader, and a
    // translate prompt on the wrong pages.
    .replace('<html lang="en">', `<html lang="${page.lang ?? "en"}">`)
    .replace(ROOT_DIV, `<div id="root">${renderRoute(page.path)}</div>`);
  // `<path>.html`, NOT `<path>/index.html`: Cloudflare Pages serves a directory
  // index only after a 308 to the trailing-slash form, which would leave every
  // visitor a redirect hop and — worse — make the canonical URL itself a redirect
  // target (`/tools/x` → `/tools/x/`, whose canonical says `/tools/x`). Verified
  // against `wrangler pages dev`: the `.html` sibling is served at the clean path
  // directly, 200, no hop.
  const out = page.path === "/" ? join(dist, "index.html") : join(dist, `${page.path.slice(1)}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`prerendered ${page.path} → ${out.replace(dist, "dist")} (${(html.length / 1024).toFixed(1)} kB)`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by prerender/prerender.mjs from lib/seo.ts PUBLIC_PAGES. Do not edit. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PUBLIC_PAGES.map(
  (p) => `  <url>
    <loc>${canonical(p.path)}</loc>
    <lastmod>${p.modified ?? buildDate}</lastmod>
    <changefreq>${p.changefreq ?? "monthly"}</changefreq>
    <priority>${p.priority ?? "0.9"}</priority>
${(p.alternates ?? [])
  .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${canonical(alt.path)}" />\n`)
  .join("")}  </url>`,
).join("\n")}
</urlset>
`;
writeFileSync(join(dist, "sitemap.xml"), sitemap);
console.log(`generated sitemap.xml (${PUBLIC_PAGES.length} urls)`);

/**
 * RSS, one feed per language edition. Still how people subscribe to writing, and
 * how several aggregators and AI crawlers notice a new post without waiting for a
 * recrawl of the index. Generated from the same BLOG_POSTS the pages render from.
 *
 * The `<lastBuildDate>` is the newest POST date, not the build clock: a feed whose
 * timestamp moves on every deploy trains readers to treat it as noise.
 */
for (const feed of BLOG_FEEDS) {
  const rfc822 = (iso) => new Date(`${iso}T00:00:00Z`).toUTCString();
  const newest = feed.items[0]?.date;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by prerender/prerender.mjs from content/blog/. Do not edit. -->
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(feed.title)}</title>
    <link>${feed.link}</link>
    <description>${escapeHtml(feed.description)}</description>
    <language>${feed.lang}</language>
    <atom:link href="${canonical(feed.path)}" rel="self" type="application/rss+xml" />
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : ""}${feed.items
    .map(
      (item) => `    <item>
      <title>${escapeHtml(item.title)}</title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <pubDate>${rfc822(item.date)}</pubDate>
      <description>${escapeHtml(item.description)}</description>
    </item>`,
    )
    .join("\n")}
  </channel>
</rss>
`;
  const out = join(dist, feed.path.slice(1));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, xml);
  console.log(`generated ${feed.path} (${feed.items.length} items)`);
}
