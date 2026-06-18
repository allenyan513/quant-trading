"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a morning brief's Markdown with dashboard-consistent dark styling.
 * react-markdown does NOT render raw HTML by default, so user-submitted Markdown is
 * safe. remark-gfm enables tables / strikethrough / autolinks.
 */
const linkStyle = { color: "#58a6ff", textDecoration: "none" } as const;

export function BriefMarkdown({ markdown }: { markdown: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", maxWidth: 780, wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: { children?: ReactNode }) => (
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "20px 0 8px" }}>{children}</h2>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "16px 0 6px" }}>{children}</h3>
          ),
          h3: ({ children }: { children?: ReactNode }) => (
            <h4 style={{ fontSize: 15, fontWeight: 700, margin: "14px 0 6px", color: "var(--muted)" }}>{children}</h4>
          ),
          p: ({ children }: { children?: ReactNode }) => <p style={{ margin: "8px 0" }}>{children}</p>,
          ul: ({ children }: { children?: ReactNode }) => (
            <ul style={{ margin: "8px 0", paddingLeft: 22 }}>{children}</ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol style={{ margin: "8px 0", paddingLeft: 22 }}>{children}</ol>
          ),
          li: ({ children }: { children?: ReactNode }) => <li style={{ margin: "3px 0" }}>{children}</li>,
          a: ({ href, children }: { href?: string; children?: ReactNode }) => (
            <a href={href} target="_blank" rel="noreferrer" style={linkStyle}>
              {children}
            </a>
          ),
          strong: ({ children }: { children?: ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          code: ({ children }: { children?: ReactNode }) => (
            <code style={{ background: "var(--panel-2)", borderRadius: 4, padding: "1px 5px", fontSize: 13 }}>
              {children}
            </code>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote style={{ borderLeft: "3px solid var(--border)", margin: "8px 0", paddingLeft: 12, color: "var(--muted)" }}>
              {children}
            </blockquote>
          ),
          table: ({ children }: { children?: ReactNode }) => (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, margin: "8px 0" }}>{children}</table>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: "6px 8px", color: "var(--muted)" }}>
              {children}
            </th>
          ),
          td: ({ children }: { children?: ReactNode }) => (
            <td style={{ borderBottom: "1px solid #21262d", padding: "6px 8px" }}>{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
