/**
 * One blog post at `/blog/<slug>` (or `/blog/zh/<slug>`).
 *
 * The post arrives as a PROP, never from `useParams()`: routes are enumerated
 * from `BLOG_POSTS` in `src/routes.tsx` and the prerender renders this component
 * directly, outside a `<Routes>` tree, where params are empty — reading them
 * there would prerender every post blank (the same trap `PresetBacktestView`
 * documents).
 *
 * Every post ends with links out: its translation, the other posts in the same
 * language, and the tool the writing is about. A leaf page with no way onward is
 * a dead end for a reader and a crawl dead end for a search engine.
 */
import { useEffect } from "react";
import Link from "@/components/link";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { PostMarkdown } from "@/components/post-markdown";
import { formatPostDate, LangSwitch } from "@/pages/blog/page";
import { applySeo, postSeo, BLOG_INDEX_COPY } from "@/lib/seo";
import { langPrefix, postsFor, translationsOf, type BlogPost } from "@/lib/blog";
import { TOOL_PATH } from "@/lib/backtest-presets";

const MORE_COPY = {
  en: { more: "More posts", tool: "Try it on your own portfolio", back: "Blog", updated: "Updated" },
  zh: { more: "更多文章", tool: "拿你自己的组合试一次", back: "博客", updated: "更新于" },
} as const;

export function BlogPostView({ post }: { post: BlogPost }) {
  const seo = postSeo(post);
  const copy = MORE_COPY[post.lang];
  const translations = translationsOf(post);
  const more = postsFor(post.lang).filter((p) => p.slug !== post.slug);

  useEffect(() => applySeo(seo), [seo]);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />
      <article style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "clamp(20px, 5vw, 40px) clamp(16px, 5vw, 40px) 40px" }}>
        {/* A visible breadcrumb back to the index, matching the BreadcrumbList in
            this page's JSON-LD — the structured data has to describe something a
            reader can actually see. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, fontSize: 13 }}>
          <Link href={langPrefix(post.lang)} style={{ flex: 1, color: "var(--muted)" }}>
            ← {BLOG_INDEX_COPY[post.lang].heading}
          </Link>
          {/* Only offered when the translation exists — a link to an unwritten
              page is worse than no switch at all. */}
          <LangSwitch
            current={post.lang}
            pathFor={(l) => translations.find((t) => t.lang === l)?.path ?? null}
          />
        </div>

        <h1 style={{ fontSize: "clamp(27px, 5vw, 38px)", fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.2, margin: "18px 0 0" }}>
          {post.title}
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "12px 0 26px" }}>
          <time dateTime={post.date}>{formatPostDate(post.date, post.lang)}</time>
          {post.updated !== post.date && (
            <>
              {" · "}
              {copy.updated} <time dateTime={post.updated}>{formatPostDate(post.updated, post.lang)}</time>
            </>
          )}
        </p>

        <PostMarkdown markdown={post.body} />

        <section style={{ marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <Link href={TOOL_PATH} style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>
            {copy.tool} →
          </Link>
        </section>

        {more.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.3, margin: "0 0 10px" }}>
              {copy.more}
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {more.map((p) => (
                <li key={p.path} style={{ fontSize: 15, lineHeight: 1.9 }}>
                  <Link href={p.path} style={{ color: "var(--text)" }}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <PublicFooter />
    </main>
  );
}

export default BlogPostView;
