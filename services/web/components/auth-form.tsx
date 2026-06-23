"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";

/** Email/password sign-in or sign-up form (Better Auth). On success, redirects to
 *  the `from` route (set by middleware) or the dashboard home. */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const from = new URLSearchParams(window.location.search).get("from") || "/workspace";
    const res = isSignUp
      ? await signUp.email({ email, password, name: name.trim() || email.split("@")[0] || "user" })
      : await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? (isSignUp ? "Sign up failed" : "Incorrect email or password"));
      return;
    }
    // MCP OAuth resume: when Better Auth's authorize bounced an unauthenticated user
    // here mid-flow, the sign-in response carries a redirect back into the authorize →
    // consent chain. Follow it if present; otherwise go to `from` / the workspace.
    const resumeUrl = (res.data as { url?: string; redirect?: boolean } | null | undefined)?.url;
    window.location.href = resumeUrl || from;
  }

  // Google (preferred). Better Auth handles the redirect to Google + the callback;
  // for the MCP-authorize case the oidc_login_prompt cookie hook resumes to consent.
  async function googleSignIn() {
    const callbackURL = new URLSearchParams(window.location.search).get("from") || "/workspace";
    await signIn.social({ provider: "google", callbackURL });
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
      <form
        onSubmit={submit}
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
        <button
          type="button"
          onClick={googleSignIn}
          style={{
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
          }}
        >
          Continue with Google
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 12 }}>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        {isSignUp && (
          <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        )}
        <input
          type="email"
          autoFocus
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (at least 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <div style={{ color: "#f85149", fontSize: 13 }}>⚠️ {error}</div>}
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
          {busy ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>
          {isSignUp ? (
            <>Already have an account?<Link href="/sign-in" style={{ color: "#58a6ff" }}> Sign in</Link></>
          ) : (
            <>No account yet?<Link href="/sign-up" style={{ color: "#58a6ff" }}> Sign up</Link></>
          )}
        </div>
      </form>
    </div>
  );
}
