/**
 * Minimal single-password auth.
 *
 * A correct password mints a signed, httpOnly session cookie: `${exp}.${sig}`
 * where sig = HMAC-SHA256(secret, exp). No password is ever stored in the
 * cookie. Uses Web Crypto so it runs in BOTH the Edge middleware and Node
 * route handlers. Comparisons are constant-time.
 */

export const COOKIE_NAME = "qt_dash_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(sig);
}

function sessionSecret(): string {
  const s = process.env.DASHBOARD_SESSION_SECRET;
  if (!s || s.trim() === "") {
    throw new Error("Missing required env var: DASHBOARD_SESSION_SECRET");
  }
  return s;
}

/** Build a signed session cookie value valid for SESSION_TTL_MS. */
export async function createSession(): Promise<{ value: string; maxAgeSec: number }> {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = await hmacHex(sessionSecret(), String(exp));
  return { value: `${exp}.${sig}`, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) };
}

/** True iff the cookie is well-formed, correctly signed, and unexpired. */
export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(sessionSecret(), expStr);
  return constantTimeEqual(sig, expected);
}

/** Constant-time password check against DASHBOARD_PASSWORD. */
export function checkPassword(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.trim() === "") {
    throw new Error("Missing required env var: DASHBOARD_PASSWORD");
  }
  return constantTimeEqual(input, expected);
}
