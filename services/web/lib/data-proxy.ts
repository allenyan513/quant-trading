/**
 * The single home for forwarding a web API route to the internal data service.
 *
 * web stays read-only / public-facing; any write or live-external read is owned by
 * data (T12), so web routes proxy to it. This used to be copy-pasted in ~13 routes
 * (each with its own `dataUrl()` + inline fetch + envelope unwrap); centralize it
 * here. `deliverJson` (@qt/shared) is for service-to-service outbox delivery
 * (POST, fire-and-forget, no body) — these helpers instead RETURN the unwrapped
 * `data` so a route can surface it.
 *
 * DATA_URL is read via static process.env (Next inlines it; config.dataUrl()'s
 * dynamic requireEnv reads empty in the route runtime — see lib/db.ts).
 */
const TIMEOUT_MS = 10_000;

export function dataUrl(): string {
  const u = process.env.DATA_URL;
  if (!u) throw new Error("Missing required env var: DATA_URL");
  return u;
}

/** Unwrap data's ok(data) / fail(code, msg) envelope, or throw with its message. */
async function unwrap<T>(resp: Response, path: string): Promise<T> {
  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string; code?: string } | string } | null;
  if (!resp.ok || !json?.ok) {
    const e = json?.error;
    // Fall back to the error code when the message is absent (data's fail(code, msg)).
    const msg = typeof e === "object" ? (e?.message ?? e?.code) : e;
    throw new Error(msg ?? `data ${path} returned ${resp.status}`);
  }
  return json.data as T;
}

/** GET a data endpoint and return its unwrapped `data`. */
export async function dataGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${dataUrl()}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return unwrap<T>(resp, path);
}

/** POST a JSON body to a data endpoint and return its unwrapped `data`. */
export async function dataPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${dataUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return unwrap<T>(resp, path);
}
