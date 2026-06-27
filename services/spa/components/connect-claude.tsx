"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { apiUrl } from "@/lib/api-base";

/**
 * Compact MCP-URL copy control — a single pill button for the landing hero. Shows the
 * endpoint and copies it on click (→ "Copied"), sitting beside the primary "Try" CTA.
 * Same MCP URL source as ConnectClaude (apiUrl("/api/mcp"), the gateway endpoint).
 */
export function McpCopyButton() {
  const [url] = useState(() => {
    const resolved = apiUrl("/api/mcp");
    // External clients (Claude Desktop / claude.ai) need an ABSOLUTE url — if
    // VITE_API_URL is unset/relative, resolve it against the current origin.
    if (resolved && typeof window !== "undefined" && !/^https?:\/\//i.test(resolved)) {
      try {
        return new URL(resolved, window.location.origin).href;
      } catch {
        return resolved;
      }
    }
    return resolved;
  });
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    const flash = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };
    // This compact button never shows the URL text, so a silent copy failure would
    // strand the user — fall back through execCommand and finally a prompt so they
    // can always get the URL (insecure-context / older-mobile browsers).
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        flash();
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) {
        flash();
        return;
      }
    } catch {
      /* fall through */
    }
    window.prompt("Copy the MCP URL:", url);
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!url}
      aria-label="Copy MCP connector URL"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 48,
        padding: "0 20px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
        fontSize: 15,
        fontWeight: 500,
        cursor: url ? "pointer" : "default",
        opacity: url ? 1 : 0.6,
        maxWidth: "100%",
      }}
    >
      {copied ? <Check size={16} strokeWidth={2.2} color="var(--up)" /> : <Copy size={16} strokeWidth={2} color="var(--muted)" />}
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {copied ? "Copied MCP URL" : "Copy MCP URL"}
      </span>
    </button>
  );
}

/**
 * The user's MCP connector URL + a copy button and short instructions. The MCP
 * endpoint lives on the gateway (api subdomain), so build it from VITE_API_URL via
 * apiUrl("/api/mcp") → `${gateway}/mcp` — NOT the SPA origin. Backs the homepage
 * "connect your Claude" block.
 */
export function ConnectClaude() {
  const [url] = useState(() => apiUrl("/api/mcp"));
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — user can select the text manually */
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            overflow: "auto",
            whiteSpace: "nowrap",
            color: url ? "var(--text)" : "var(--muted)",
          }}
        >
          {url || "Loading…"}
        </code>
        <button
          onClick={copy}
          disabled={!url}
          style={{
            background: "#1f6feb",
            border: "1px solid #388bfd",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: url ? "pointer" : "default",
            opacity: url ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        In <b>Claude Desktop</b> or <b>claude.ai</b>, add a custom connector and paste the URL above.
        Claude will open an authorization page — just sign in and authorize with this same account.
        After that you can ask Claude directly: "my holdings / my watchlist / research a ticker for me".
      </p>
    </div>
  );
}
