/**
 * Server-side forwarder to the portfolio service (mirror of `data-proxy.ts`). The
 * gateway is read-only on the DB, so any write the portfolio service owns — placing a
 * paper order, cancelling/matching, resetting the account — is forwarded here. Moved
 * from web: now plain Node, so PORTFOLIO_URL is read via the lazy `config.portfolioUrl()`
 * getter. Unwraps the `ok(data)` / `fail(code, msg)` envelope.
 */
import { config } from "@qt/shared";

const TIMEOUT_MS = 10_000;

export function portfolioUrl(): string {
  return config.portfolioUrl();
}

async function unwrap<T>(resp: Response, path: string): Promise<T> {
  const json = (await resp.json().catch(() => null)) as
    | { ok?: boolean; data?: T; error?: { message?: string; code?: string } | string }
    | null;
  if (!resp.ok || !json?.ok) {
    const e = json?.error;
    const msg = typeof e === "object" ? (e?.message ?? e?.code) : e;
    throw new Error(msg ?? `portfolio ${path} returned ${resp.status}`);
  }
  return json.data as T;
}

/** POST a JSON body to a portfolio endpoint and return its unwrapped `data`. */
export async function portfolioPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${portfolioUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return unwrap<T>(resp, path);
}
