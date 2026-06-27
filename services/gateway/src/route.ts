import type { Context, Handler } from "hono";
import { ok, fail } from "@qt/shared";
import { auth } from "./auth.js";
import { log } from "./log.js";

// A handler may attach optional per-request log context (e.g. { symbol, userId }) via
// `c.set("logContext", …)`; the wrapper merges it into the error log so centralizing the
// catch doesn't lose the contextual metadata the inline catches carried.
declare module "hono" {
  interface ContextVariableMap {
    logContext?: Record<string, unknown>;
  }
}

/**
 * Wrap a Hono handler with the service's standard envelope + error handling: run
 * `fn`, wrap its return as `ok(data)`; on a thrown error, log the dotted `<name>.failed`
 * event and return `fail(<name>_failed, message)` 500 (the snake-case code is derived
 * from the dotted name, matching the repo's existing log-event / error-code split).
 * A handler that needs a non-200 status (e.g. a 400 `bad_request`) just returns
 * `c.json(fail(...), code)` itself — a Response is passed through untouched. Mirrors
 * web's `lib/api.ts` `handle()`; collapses the try/catch/log/fail boilerplate every
 * endpoint used to repeat.
 */
export function route<T>(name: string, fn: (c: Context) => Promise<T>): Handler {
  return async (c: Context) => {
    try {
      const res = await fn(c);
      return res instanceof Response ? res : c.json(ok(res));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${name}.failed`, { error: msg, ...(c.get("logContext") ?? {}) });
      return c.json(fail(`${name.replace(/\./g, "_")}_failed`, msg), 500);
    }
  };
}

/** Resolve the session user id (cookie OR `Authorization: Bearer`, via Better Auth's
 *  bearer plugin), or null if unauthenticated. */
export async function sessionUid(c: Context): Promise<string | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user?.id ?? null;
}

/**
 * Wrap an authed handler (mirror of web's `authedRoute`): resolve the SESSION user id,
 * 401 if none, else run `fn(c, uid)` with the same envelope + error handling as
 * `route()`. Tenant isolation lives here ONCE — a client can never supply userId; every
 * per-user read/write takes the uid from the session (the red line in services.md).
 */
export function authed<T>(name: string, fn: (c: Context, uid: string) => Promise<T>): Handler {
  return async (c: Context) => {
    let uid: string | null = null;
    try {
      uid = await sessionUid(c);
    } catch {
      // An auth-lookup failure is treated as unauthorized, not a 500.
      uid = null;
    }
    if (!uid) return c.json(fail("unauthorized", "unauthorized"), 401);
    try {
      const res = await fn(c, uid);
      return res instanceof Response ? res : c.json(ok(res));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${name}.failed`, { error: msg, uid, ...(c.get("logContext") ?? {}) });
      return c.json(fail(`${name.replace(/\./g, "_")}_failed`, msg), 500);
    }
  };
}

/** Parse a JSON body, tolerating an empty/invalid body (→ {}). Mirrors web's `readBody`. */
export async function readBody<T = Record<string, unknown>>(c: Context): Promise<T> {
  return (await c.req.json().catch(() => ({}))) as T;
}

/** A trimmed query-string value, or undefined if blank/missing (mirrors web's `param`). */
export function qstr(c: Context, name: string): string | undefined {
  const v = c.req.query(name)?.trim();
  return v ? v : undefined;
}

/** An integer query-string value, or undefined if missing/non-numeric (web's `intParam`). */
export function qint(c: Context, name: string): number | undefined {
  const v = qstr(c, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
