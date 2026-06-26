/**
 * Route-handler seam — the single home for the BFF's per-route ceremony, so the
 * 50+ /api/* handlers stop copy-pasting the auth guard + envelope + body parse.
 *
 * - publicRoute: wrap a handler that needs no session (e.g. a public market-data
 *   forward) → ok(data) envelope via handle(), 500 on throw.
 * - authedRoute: require a DB-validated session and pass the SESSION user id into
 *   the handler positionally. Tenant isolation lives here ONCE: a client can never
 *   supply userId — every per-user read/write takes the uid from the session, not
 *   the request body (the red line in web.md / services.md). No session → 401
 *   envelope so the SWR fetcher redirects to /sign-in (not handle()'s 500).
 *
 * Each route file still needs `export const runtime/dynamic` — Next reads segment
 * config statically per-module and it can't be re-exported through a helper.
 */
import { handle } from "@/lib/api";
import { requireUserOr401 } from "@/lib/session";

/** Wrap a public (no-auth) handler: result → envelope, 500 on throw. */
export function publicRoute<T, C = unknown>(fn: (req: Request, ctx: C) => Promise<T> | T) {
  return (req: Request, ctx: C) => handle(() => Promise.resolve(fn(req, ctx)));
}

/** Wrap an authed handler: 401 if no session, else run with the session user id. */
export function authedRoute<T, C = unknown>(fn: (uid: string, req: Request, ctx: C) => Promise<T> | T) {
  return async (req: Request, ctx: C) => {
    const uid = await requireUserOr401();
    if (typeof uid !== "string") return uid;
    return handle(() => Promise.resolve(fn(uid, req, ctx)));
  };
}

/** Parse a JSON body, tolerating an empty/invalid body (→ {}). */
export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}
