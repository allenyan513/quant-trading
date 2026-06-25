import { mutate } from "swr";

/** Revalidates both the rows (/api/watchlist) and the groups (/api/watchlist/lists). */
export const refresh = () => mutate((k) => typeof k === "string" && k.startsWith("/api/watchlist"));

/**
 * Client helper for the watchlist write endpoints: fire the request, unwrap the
 * { ok, error } envelope, and alert on failure. Returns true on success.
 *
 * Centralizes the fetch + envelope-check that was repeated across the add / assign /
 * remove / list-management / drag handlers — several of which used to fire bare and
 * swallow failures silently.
 */
export async function watchlistSend(path: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !j.ok) {
    alert(`Request failed: ${j.error ?? res.status}`);
    return false;
  }
  return true;
}
