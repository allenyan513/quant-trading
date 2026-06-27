/**
 * Single source for the gateway base URL + the `/api`-prefix strip, so every ported
 * call site keeps its `/api/...` path unchanged. The old Next app served `/api/*`
 * same-origin; the gateway serves the same routes rootless (no `/api`) on the api
 * subdomain — `apiUrl` bridges the two: `/api/watchlist` → `${VITE_API_URL}/watchlist`.
 *
 * All cross-origin calls also need `credentials: "include"` so the Better Auth session
 * cookie (set on the shared parent domain, same-site) rides along — see FETCH_OPTS.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

export function apiUrl(path: string): string {
  return BASE + path.replace(/^\/api/, "");
}

/** Default fetch options for every gateway call — send the session cookie cross-origin. */
export const FETCH_OPTS: RequestInit = { credentials: "include" };
