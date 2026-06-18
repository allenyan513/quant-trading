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
    const from = new URLSearchParams(window.location.search).get("from") || "/";
    const res = isSignUp
      ? await signUp.email({ email, password, name: name.trim() || email.split("@")[0] || "user" })
      : await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? (isSignUp ? "注册失败" : "邮箱或密码不正确"));
      return;
    }
    window.location.href = from;
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
          {isSignUp ? "创建账户" : "登录"}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 13 }}>quant-trading</span>
        </div>
        {isSignUp && (
          <input placeholder="名称(可选)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        )}
        <input
          type="email"
          autoFocus
          required
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="密码(至少 8 位)"
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
          {busy ? "请稍候…" : isSignUp ? "注册" : "登录"}
        </button>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>
          {isSignUp ? (
            <>已有账户?<Link href="/sign-in" style={{ color: "#58a6ff" }}> 登录</Link></>
          ) : (
            <>没有账户?<Link href="/sign-up" style={{ color: "#58a6ff" }}> 注册</Link></>
          )}
        </div>
      </form>
    </div>
  );
}
