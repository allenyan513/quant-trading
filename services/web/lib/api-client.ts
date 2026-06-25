/**
 * Client-side (browser) helper for hitting web's own `/api/*` routes and unwrapping
 * the { ok, data, error } envelope. The browser-side counterpart to lib/data-proxy.ts
 * (which is the SERVER-side route → data-service forwarder, reachable only in route
 * handlers). Centralizes the fetch + envelope-check that was copy-pasted across ~13
 * client write sites, several of which swallowed failures silently.
 *
 * - `apiSend` returns the unwrapped envelope so callers can read `.data` or surface
 *   `.error` their own way (inline message, etc.).
 * - `apiAction` is the fire-and-refresh convenience: alerts on failure, returns ok.
 */

export interface ApiResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export async function apiSend<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string };
    if (!res.ok || !j.ok) return { ok: false, data: null, error: j.error ?? `HTTP ${res.status}` };
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
