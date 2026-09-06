/**
 * The single home for forwarding a gateway request to the internal data service.
 *
 * The gateway is read-only on the DB; any write or live-external read is owned by
 * data (T12), so the MCP write tools (submit_memo / update_memo / submit_morning_brief
 * / search_sec_filings) proxy to it. `deliverJson` (@qt/shared) is for service-to-
 * service outbox delivery (POST, fire-and-forget); these helpers instead RETURN the
 * unwrapped `data` so a tool can surface it.
 *
 * Moved from web's `lib/data-proxy.ts`: now plain Node (not Next), so DATA_URL is read
 * via the lazy `config.dataUrl()` getter (the static-process.env workaround the Next
 * route runtime needed is gone).
 */
import { config } from "@qt/shared";

const TIMEOUT_MS = 10_000;

/** Error from a forwarded call, carrying data's envelope code + HTTP status so a
 *  caller can re-surface a 400 as a 400 instead of flattening it to a 500. */
export class DataProxyError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly status: number) {
    super(message);
    this.name = "DataProxyError";
  }
}

export function dataUrl(): string {
  return config.dataUrl();
}

/** Unwrap data's ok(data) / fail(code, msg) envelope, or throw with its message. */
async function unwrap<T>(resp: Response, path: string): Promise<T> {
  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string; code?: string } | string } | null;
  if (!resp.ok || !json?.ok) {
    const e = json?.error;
    // Fall back to the error code when the message is absent (data's fail(code, msg)).
    const msg = typeof e === "object" ? (e?.message ?? e?.code) : e;
    const code = typeof e === "object" ? e?.code : typeof e === "string" ? e : undefined;
    throw new DataProxyError(msg ?? `data ${path} returned ${resp.status}`, code, resp.status);
  }
  return json.data as T;
}

/** GET a data endpoint and return its unwrapped `data`. `timeoutMs` overrides the
 *  default for the rare endpoint that fans out to several upstreams on a cold cache. */
export async function dataGet<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const resp = await fetch(`${dataUrl()}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
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
