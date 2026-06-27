"use client";

import { useState } from "react";
import { apiUrl, FETCH_OPTS } from "@/lib/api-base";

/**
 * The Authorize / Deny UI of the OAuth consent screen (/oauth/consent). Posts the
 * decision to the gateway's Better Auth consent endpoint and follows the returned
 * redirect back to the client (Claude). The user reaches this already signed in.
 */
export function ConsentForm({
  clientName,
  redirectHost,
  scope,
  consentCode,
  userEmail,
}: {
  clientName: string;
  redirectHost: string;
  scope: string;
  consentCode: string;
  userEmail: string;
}) {
  const [busy, setBusy] = useState<null | "accept" | "deny">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "deny");
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/oauth2/consent"), {
        ...FETCH_OPTS,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      const json = (await res.json().catch(() => ({}))) as { redirectURI?: string; message?: string };
      if (!res.ok) {
        setError(json.message || `Request failed (${res.status})`);
        setBusy(null);
        return;
      }
      if (json.redirectURI) {
        window.location.href = json.redirectURI;
        return;
      }
      setError("The authorization server did not return a redirect.");
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
          width: 380,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          <span style={{ color: "var(--accent)" }}>Sweet</span>ValueLab
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
          {clientName} wants to connect to your account
        </div>

        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
          Signed in as <span style={{ color: "var(--text)" }}>{userEmail}</span>. If you authorize,
          it will be able to:
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)", lineHeight: 1.8 }}>
          <li>Read company research (filings, ownership, valuation)</li>
          <li>Read your watchlist and your holdings</li>
        </ul>

        {redirectHost && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Redirects to <span style={{ color: "var(--text)" }}>{redirectHost}</span>
          </div>
        )}

        {error && <div style={{ color: "var(--down)", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => decide(false)}
            disabled={busy !== null}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy === "deny" ? "Denying…" : "Deny"}
          </button>
          <button
            onClick={() => decide(true)}
            disabled={busy !== null}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "#06223f",
              background: "var(--accent)",
              border: "1px solid var(--accent)",
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy === "accept" ? "Authorizing…" : "Authorize"}
          </button>
        </div>

        {scope && (
          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>scope: {scope}</div>
        )}
      </div>
    </div>
  );
}
