/**
 * Markdown renderer for blog posts — reading typography, not dashboard density.
 *
 * Separate from `brief-markdown.tsx` on purpose, and not a variant of it: that
 * one renders a morning brief inside the app (14px, no max width worth speaking
 * of, and every link forced to `target="_blank"`). A post is the opposite case —
 * long-form prose at a comfortable measure, and its links are mostly INTERNAL,
 * where opening a new tab is hostile to the reader and a crawler reads the plain
 * `<a href>` either way.
 *
 * Internal links go through react-router's `<Link>`, so moving between posts and
 * tools stays a client-side navigation while still rendering a real anchor with
 * a real href (which is all a crawler follows). External links keep `noreferrer`
 * and open in a new tab.
 *
 * react-markdown does not pass raw HTML through, so nothing in a post can inject
 * markup — `assertBlogGraph()` rejects HTML in a body rather than letting it
 * render as visible source text.
 */
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "@/components/link";

const linkStyle = { color: "var(--accent)", textDecoration: "none" } as const;

export function PostMarkdown({ markdown }: { markdown: string }) {
  return (
    <div style={{ fontSize: 16.5, lineHeight: 1.75, color: "var(--text)", wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The page already renders the post title as its `<h1>`, so a body
          // heading starts at `<h2>` — one h1 per document, and the outline has
          // to stay in order for both screen readers and search.
          h1: ({ children }: { children?: ReactNode }) => (
            <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 10px" }}>{children}</h2>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.3, margin: "34px 0 10px" }}>{children}</h2>
          ),
          h3: ({ children }: { children?: ReactNode }) => (
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "26px 0 8px" }}>{children}</h3>
          ),
          p: ({ children }: { children?: ReactNode }) => <p style={{ margin: "14px 0" }}>{children}</p>,
          ul: ({ children }: { children?: ReactNode }) => (
            <ul style={{ margin: "14px 0", paddingLeft: 24 }}>{children}</ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol style={{ margin: "14px 0", paddingLeft: 24 }}>{children}</ol>
          ),
          li: ({ children }: { children?: ReactNode }) => <li style={{ margin: "7px 0" }}>{children}</li>,
          a: ({ href, children }: { href?: string; children?: ReactNode }) =>
            href && href.startsWith("/") ? (
              <Link href={href} style={linkStyle}>
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" style={linkStyle}>
                {children}
              </a>
            ),
          strong: ({ children }: { children?: ReactNode }) => (
            <strong style={{ fontWeight: 700, color: "var(--text)" }}>{children}</strong>
          ),
          em: ({ children }: { children?: ReactNode }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
          code: ({ children }: { children?: ReactNode }) => (
            <code style={{ background: "var(--panel-2)", borderRadius: 4, padding: "1px 5px", fontSize: 14.5 }}>
              {children}
            </code>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "28px 0" }} />,
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote
              style={{
                borderLeft: "3px solid var(--border)",
                margin: "16px 0",
                paddingLeft: 16,
                color: "var(--muted)",
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }: { children?: ReactNode }) => (
            <div style={{ overflowX: "auto", margin: "16px 0" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14.5 }}>{children}</table>
            </div>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
                padding: "8px 10px",
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }: { children?: ReactNode }) => (
            <td style={{ borderBottom: "1px solid var(--border)", padding: "8px 10px" }}>{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
