/**
 * `/blog` (English) and `/blog/zh` (Chinese) — one index per language edition.
 *
 * Like `/tools`, this page's job is internal linking: a prerendered post nobody
 * links to is a post a crawler never finds. The list renders from `BLOG_POSTS`,
 * so publishing a Markdown file puts it here, in the sitemap and in the feed
 * without a second edit.
 *
 * The two editions are separate pages with their own canonical URLs, not a
 * client-side language toggle — each has to be independently crawlable and
 * shareable, and `hreflang` (see `lib/seo.ts`) is what ties them together.
 *
 * `lang` arrives as a PROP, never from `useParams()`: the prerender renders this
 * component directly, outside a `<Routes>` tree, where params are empty.
 *
 * Static and prerendered like the rest of the public surface: no session check,
 * no fetch.
 */
import { useEffect } from "react";
import Link from "@/components/link";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { applySeo, blogIndexSeo, BLOG_INDEX_COPY } from "@/lib/seo";
import { BLOG_LANGS, LANG_LABEL, langPrefix, postsFor, type BlogLang, type BlogPost } from "@/lib/blog";

/** ISO date → the reader's own convention. Pinned to UTC so the build machine's
 *  timezone can never shift a post's date by a day. */
export function formatPostDate(iso: string, lang: BlogLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Link to the other language editions of the blog. A real anchor, so it is also
 *  how a crawler reaches the other edition's index. */
export function LangSwitch({ current, pathFor }: { current: BlogLang; pathFor: (lang: BlogLang) => string | null }) {
  const others = BLOG_LANGS.filter((l) => l !== current)
    .map((l) => ({ lang: l, path: pathFor(l) }))
    .filter((o): o is { lang: BlogLang; path: string } => o.path !== null);
  if (others.length === 0) return null;
  return (
    <span style={{ fontSize: 13, color: "var(--muted)" }}>
      {others.map((o) => (
        <Link key={o.lang} href={o.path} hrefLang={o.lang === "en" ? "en" : "zh-Hans"} style={{ color: "var(--accent)" }}>
          {LANG_LABEL[o.lang]}
        </Link>
      ))}
    </span>
  );
}

export default function BlogIndexPage({ lang }: { lang: BlogLang }) {
  const seo = blogIndexSeo(lang);
  const copy = BLOG_INDEX_COPY[lang];
  const posts = postsFor(lang);

  useEffect(() => applySeo(seo), [seo]);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "clamp(20px, 5vw, 48px) clamp(16px, 5vw, 40px) 48px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ flex: 1, fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15, margin: 0 }}>
            {copy.heading}
          </h1>
          {/* Both indexes always exist, so the switch never has to disappear here. */}
          <LangSwitch current={lang} pathFor={(l) => langPrefix(l)} />
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--muted)", margin: "14px 0 0" }}>{copy.intro}</p>

        {posts.map((post) => (
          <PostEntry key={post.path} post={post} />
        ))}
      </div>
      <PublicFooter />
    </main>
  );
}

function PostEntry({ post }: { post: BlogPost }) {
  return (
    <article style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 22 }}>
      {/* The heading IS the link — one anchor per post, its title as the text. */}
      <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.3, margin: 0, lineHeight: 1.35 }}>
        <Link href={post.path} style={{ color: "var(--accent)" }}>
          {post.title}
        </Link>
      </h2>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>
        <time dateTime={post.date}>{formatPostDate(post.date, post.lang)}</time>
      </p>
      {/* The description doubles as the blurb: one sentence written once, so the
          index, the meta description and the feed can never disagree. */}
      <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--muted)", margin: "10px 0 0" }}>{post.description}</p>
    </article>
  );
}
