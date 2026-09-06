/**
 * Client-side (browser) helper for hitting the gateway's `/api/*` routes (via `apiUrl`,
 * which rewrites to the rootless api-subdomain paths) and unwrapping the
 * { ok, data, error } envelope. The gateway forwards writes to the internal services
 * (data / portfolio). Centralizes the fetch + envelope-check that was copy-pasted across
 * ~13 client write sites, several of which swallowed failures silently.
 *
 * - `apiSend` returns the unwrapped envelope so callers can read `.data` or surface
 *   `.error` their own way (inline message, etc.).
 * - `apiAction` is the fire-and-refresh convenience: alerts on failure, returns ok.
 */

import { apiUrl, FETCH_OPTS } from "@/lib/api-base";

export interface ApiResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export async function apiSend<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(apiUrl(path), {
      ...FETCH_OPTS,
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    // The envelope's `error` is an OBJECT (`{ code, message }` — see
    // `@qt/shared`'s ErrorDetail), not a string. Typing it as a string here used to
    // hand callers an object through a `string | null` field, which TypeScript then
    // could not catch: `setError(res.error)` followed by `{error}` in JSX threw
    // "Objects are not valid as a React child" and blanked the whole page on any
    // 4xx (e.g. an unknown ticker on the public backtest tool). Normalize to a
    // string HERE so every call site keeps working unchanged.
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: T;
      error?: { code?: string; message?: string } | string | null;
    };
    if (!res.ok || !j.ok) {
      const e = j.error;
      const msg = typeof e === "string" ? e : (e?.message ?? e?.code);
      return { ok: false, data: null, error: msg ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: j.data ?? null, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** apiSend + alert on failure; returns whether it succeeded. For fire-and-refresh actions. */
export async function apiAction(path: string, method: string, body?: unknown): Promise<boolean> {
  const r = await apiSend(path, method, body);
  if (!r.ok) alert(`Request failed: ${r.error}`);
  return r.ok;
}
