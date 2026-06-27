"use client";

import { useState } from "react";
import Link from "@/components/link";
import { signIn, signUp } from "@/lib/auth-client";

/** Only allow same-origin relative redirect targets ("/foo") — never an absolute
 *  URL or protocol-relative "//evil.com" — so the `from` param can't be used for an
 *  open-redirect / phishing bounce after login. */
function safeFrom(): string {
  if (typeof window === "undefined") return "/workspace";
  const raw = new URLSearchParams(window.location.search).get("from");
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/workspace";
}

/** Sign-in (email/password or Google) / Google-only sign-up form (Better Auth).
 *  Email+password sign-up is disabled (Google-only) to avoid pre-registration
 *  account-takeover; existing password accounts can still sign in. */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Incorrect email or password");
      return;
    }
    // MCP OAuth resume: when Better Auth's authorize bounced an unauthenticated user
    // here mid-flow, the sign-in response carries a redirect back into the authorize →
    // consent chain. Follow it if present; otherwise go to the validated `from`.
    const resumeUrl = (res.data as { url?: string; redirect?: boolean } | null | undefined)?.url;
    window.location.href = resumeUrl || safeFrom();
  }

  // Google (preferred + the only sign-up path). Better Auth handles the redirect to
  // Google + the callback; for the MCP-authorize case the oidc_login_prompt cookie
  // hook resumes to consent. callbackURL is validated to a same-origin path.
  async function googleSignIn() {
    await signIn.social({ provider: "google", callbackURL: safeFrom() });
  }

  const inputStyle = {
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  } as const;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 28,
          width: 340,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
          {isSignUp ? "Create account" : "Sign in"}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 13 }}>SweetValueLab</span>
        </div>

        <button type="button" onClick={googleSignIn} style={googleBtnStyle}>
          Continue with Google
        </button>

        {isSignUp ? (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "2px 0 0" }}>
            New accounts are created with Google. After signing in you can connect your Claude over MCP.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              {error && <div style={{ color: "var(--down)", fontSize: 13 }}>⚠️ {error}</div>}
              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                  background: busy ? "#1f6f3f" : "#238636",
                  border: "1px solid #2ea043",
                  cursor: busy ? "default" : "pointer",
                }}
              >
                {busy ? "Please wait…" : "Sign in"}
              </button>
            </form>
          </>
        )}

        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>
          {isSignUp ? (
            <>Already have an account?<Link href="/sign-in" style={{ color: "var(--accent)" }}> Sign in</Link></>
          ) : (
            <>New here?<Link href="/sign-up" style={{ color: "var(--accent)" }}> Create account</Link></>
          )}
        </div>
      </div>
    </div>
  );
}

const googleBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text)",
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  cursor: "pointer",
};
