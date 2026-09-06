/**
 * The blog registry — every post, read from Markdown files in `content/blog/`.
 *
 * WHY FILES AND NOT A TABLE: the whole public surface is prerendered to static
 * HTML at build time (see `prerender/`), and that is what makes it indexable. A
 * DB-backed post would either have to render client-side — handing a crawler an
 * empty `<div id="root">`, exactly the problem the prerender exists to solve —
 * or need a rebuild hook on every edit. Posts are prose, they change rarely, and
 * git already gives them review, history and rollback. Publishing is a PR.
 *
 * BILINGUAL: `content/blog/en/<slug>.md` and `content/blog/zh/<slug>.md`. A slug
 * that exists in both languages becomes a translation pair, which is what feeds
 * the `hreflang` alternates in the head and the sitemap. Neither language is a
 * subset of the other — a post may exist in one language only, and then it
 * simply has no alternate. This is the one place on the public surface where
 * non-English copy is intended (see `.claude/rules/spa.md`); the chrome around
 * it (`/about`, footer, tools) stays English.
 *
 * SINGLE SOURCE feeding four consumers, so none of them can drift: the index
 * pages (`pages/blog/`), the routes (`src/routes.tsx`), `PUBLIC_PAGES` +
 * sitemap + RSS (`lib/seo.ts`, `prerender/`), and the footer link.
 *
 * Pure data — no JSX, so the prerender and the sitemap generator can read it in
 * Node. The Markdown bodies come in through `import.meta.glob(..., '?raw')`,
 * which Vite inlines at build time for both the browser bundle and the SSR one.
 */

export const BLOG_PATH = "/blog";

export const BLOG_LANGS = ["en", "zh"] as const;
export type BlogLang = (typeof BLOG_LANGS)[number];

/** Path prefix per language. `zh` lives under `/blog/zh/`, so no English slug may
 *  ever BE `zh` — `assertBlogGraph()` enforces that rather than trusting it. */
export const langPrefix = (lang: BlogLang): string => (lang === "en" ? BLOG_PATH : `${BLOG_PATH}/${lang}`);

/** `hreflang` value written into the head and the sitemap. */
export const hreflangOf = (lang: BlogLang): string => (lang === "en" ? "en" : "zh-Hans");

/** `<html lang>` for the prerendered file. */
export const htmlLangOf = (lang: BlogLang): string => (lang === "en" ? "en" : "zh-Hans");

/** Reader-facing label for the language switch. In its OWN language, always —
 *  the whole point is to be recognizable to someone who can't read the other. */
export const LANG_LABEL: Record<BlogLang, string> = { en: "English", zh: "中文" };

export interface BlogPost {
  readonly lang: BlogLang;
  /** Filename without extension. Flat, lowercase, hyphenated. */
  readonly slug: string;
  /** Canonical path, e.g. `/blog/total-return-vs-price-return`. */
  readonly path: string;
  /** ~60 chars — the width Google renders before truncating. */
  readonly title: string;
  /** 140-160 chars. Doubles as the index blurb, so it must read as a sentence. */
  readonly description: string;
  /** ISO date, first publication. Drives ordering and `datePublished`. */
  readonly date: string;
  /** ISO date of the last substantive revision. Defaults to `date`. */
  readonly updated: string;
  readonly tags: readonly string[];
  /** Markdown body, frontmatter stripped. */
  readonly body: string;
}

/** Frontmatter keys a post may set. Anything else fails the build — a typo'd key
 *  is silently-missing metadata, which is worse than a broken build. */
const KNOWN_KEYS = new Set(["title", "description", "date", "updated", "tags"]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Title / description character budgets per language — see `assertBlogGraph()`. */
const LENGTH_LIMITS: Record<BlogLang, { title: number; descMin: number; descMax: number }> = {
  en: { title: 70, descMin: 80, descMax: 180 },
  zh: { title: 36, descMin: 40, descMax: 90 },
};

/**
 * Minimal frontmatter parser: `key: value` lines between two `---` fences, plus
 * `tags: [a, b]`. Deliberately not YAML — a dependency that accepts anything
 * would also accept the shapes this file's validation is built to reject, and
 * the surface here is five keys.
 */
function parseFrontmatter(raw: string, file: string): { meta: Record<string, string | string[]>; body: string } {
  const normalized = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) throw new Error(`blog: ${file} has no --- frontmatter block at the top of the file`);

  const meta: Record<string, string | string[]> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const sep = line.indexOf(":");
    if (sep < 0) throw new Error(`blog: ${file} frontmatter line is not "key: value": ${line}`);
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`blog: ${file} has unknown frontmatter key "${key}" (allowed: ${[...KNOWN_KEYS].join(", ")})`);
    }
    if (key in meta) throw new Error(`blog: ${file} sets "${key}" twice`);
    meta[key] = key === "tags" ? parseList(value, file) : unquote(value);
  }
  return { meta, body: normalized.slice(match[0].length).trim() };
}

const unquote = (v: string): string => (/^".*"$/.test(v) || /^'.*'$/.test(v) ? v.slice(1, -1) : v);

function parseList(value: string, file: string): string[] {
  if (!/^\[.*\]$/.test(value)) throw new Error(`blog: ${file} tags must be a [bracketed, list]`);
  return value
    .slice(1, -1)
    .split(",")
    .map((t) => unquote(t.trim()))
    .filter(Boolean);
}

function str(meta: Record<string, string | string[]>, key: string, file: string): string {
  const v = meta[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`blog: ${file} is missing frontmatter "${key}"`);
  return v.trim();
}

/** `content/blog/<lang>/<slug>.md`. Eager + `?raw`: the bodies are inlined into
 *  both bundles at build time, so nothing is fetched at runtime. */
const FILES = import.meta.glob("../content/blog/*/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function loadPosts(): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const [file, raw] of Object.entries(FILES)) {
    const parts = file.split("/");
    const slug = parts[parts.length - 1].replace(/\.md$/, "");
    const lang = parts[parts.length - 2] as BlogLang;
    if (!BLOG_LANGS.includes(lang)) {
      throw new Error(`blog: ${file} sits in an unknown language folder "${lang}" (expected ${BLOG_LANGS.join("/")})`);
    }
    const { meta, body } = parseFrontmatter(raw, file);
    const date = str(meta, "date", file);
    posts.push({
      lang,
      slug,
      path: `${langPrefix(lang)}/${slug}`,
      title: str(meta, "title", file),
      description: str(meta, "description", file),
      date,
      updated: typeof meta.updated === "string" && meta.updated ? meta.updated : date,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      body,
    });
  }
  // Newest first, then slug — a stable order, so the index and the feed don't
  // reshuffle between builds when two posts share a date.
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const BLOG_POSTS: readonly BlogPost[] = loadPosts();

export const postsFor = (lang: BlogLang): readonly BlogPost[] => BLOG_POSTS.filter((p) => p.lang === lang);

/** Languages this slug is published in, so a post can link to its translation. */
export function translationsOf(post: BlogPost): readonly BlogPost[] {
  return BLOG_POSTS.filter((p) => p.slug === post.slug && p.lang !== post.lang);
}

/** Every language a slug exists in, `post` included — the `hreflang` set. */
export function alternatesOf(post: BlogPost): readonly BlogPost[] {
  return BLOG_POSTS.filter((p) => p.slug === post.slug);
}

/**
 * Build-time integrity check, in the spirit of `assertToolGraph()`. A blog is a
 * page whose entire job is to be crawled and read; a malformed post should fail
 * the build rather than ship a broken URL, an untitled page or a bad date.
 */
export function assertBlogGraph(): void {
  if (BLOG_POSTS.length === 0) throw new Error("blog: no posts found under content/blog/<lang>/*.md");

  const seen = new Set<string>();
  for (const p of BLOG_POSTS) {
    const id = `${p.lang}/${p.slug}`;
    if (!SLUG_RE.test(p.slug)) {
      throw new Error(`blog: "${id}" — slug must be lowercase, hyphenated, no slashes`);
    }
    // `/blog/zh` IS the Chinese index. An English post with that slug would sit
    // at the same URL and one of them would win at random.
    if (BLOG_LANGS.includes(p.slug as BlogLang)) {
      throw new Error(`blog: "${id}" — "${p.slug}" is a language prefix and cannot be a slug`);
    }
    if (seen.has(id)) throw new Error(`blog: duplicate post "${id}"`);
    seen.add(id);
    if (!ISO_DATE_RE.test(p.date)) throw new Error(`blog: "${id}" — date must be YYYY-MM-DD, got "${p.date}"`);
    if (!ISO_DATE_RE.test(p.updated)) throw new Error(`blog: "${id}" — updated must be YYYY-MM-DD, got "${p.updated}"`);
    if (p.updated < p.date) throw new Error(`blog: "${id}" — updated (${p.updated}) is before date (${p.date})`);
    // Length limits are per language, because a search result is measured in
    // rendered WIDTH, not in characters: a Chinese glyph is roughly two Latin
    // characters wide and carries several times the information, so holding zh
    // copy to the English count would force padded, unnatural sentences that get
    // truncated in the SERP anyway.
    const limits = LENGTH_LIMITS[p.lang];
    if (p.title.length > limits.title) {
      throw new Error(`blog: "${id}" — title is ${p.title.length} chars; keep it under ${limits.title}`);
    }
    if (p.description.length < limits.descMin || p.description.length > limits.descMax) {
      throw new Error(
        `blog: "${id}" — description is ${p.description.length} chars; aim for ${limits.descMin}-${limits.descMax}`,
      );
    }
    if (!p.body) throw new Error(`blog: "${id}" — body is empty`);
    // The Markdown renderer does not pass raw HTML through, so a post containing
    // markup would render as visible source text rather than as an element.
    if (/<[a-z][^>]*>/i.test(p.body)) throw new Error(`blog: "${id}" — raw HTML in the body is not rendered`);
  }
}

/**
 * Every site-internal path a post links to. Called by the prerender with the set
 * of paths it is actually emitting, so a link to a page that does not exist
 * fails the build — the same rule the tool hub lives by, applied to prose.
 */
export function assertBlogLinks(knownPaths: ReadonlySet<string>): void {
  const LINK_RE = /\]\((\/[^)\s]*)\)/g;
  for (const p of BLOG_POSTS) {
    for (const [, href] of p.body.matchAll(LINK_RE)) {
      const path = href.split("#")[0].replace(/\/$/, "");
      if (path && !knownPaths.has(path)) {
        throw new Error(`blog: "${p.lang}/${p.slug}" links to "${href}", which is not a page this site emits`);
      }
    }
  }
}
