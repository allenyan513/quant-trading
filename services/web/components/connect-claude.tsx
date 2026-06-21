"use client";

import { useEffect, useState } from "react";

/**
 * The user's MCP connector URL (<origin>/api/mcp) + a copy button and short
 * instructions. The origin is resolved after mount (useEffect) so server and
 * client render the same initial markup (no hydration mismatch). Backs onboarding
 * step 3 ("connect your Claude").
 */
export function ConnectClaude() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/api/mcp`);
  }, []);

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
