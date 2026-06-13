/**
 * Service-to-service HTTP delivery with timeout. Callers pair this with a DB
 * outbox row: write the row in the producing transaction, then call deliver();
 * on failure leave the row `pending` for a cron-triggered redelivery.
 */
import { config } from "./config.js";

/**
 * Guard for cron/job endpoints: true when the request's `Authorization` bearer
 * matches `JOB_TOKEN`. When `JOB_TOKEN` is unset (local dev), returns true so the
 * endpoints stay open locally; set the secret in prod so only the cron can fire.
 * Framework-agnostic — services wrap it in a tiny Hono middleware.
 */
export function isAuthorizedJob(authHeader: string | null | undefined): boolean {
  const token = config.jobToken();
  if (!token) return true; // no secret configured → open (local/dev)
  return authHeader === `Bearer ${token}`;
}

export interface DeliverResult {
  ok: boolean;
  status: number;
  error?: string;
}

export async function deliverJson(
  url: string,
  body: unknown,
  opts: { timeoutMs?: number; idempotencyKey?: string } = {},
): Promise<DeliverResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: await resp.text() };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
