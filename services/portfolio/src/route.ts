import type { Context, Handler } from "hono";
import { ok, fail } from "@qt/shared";
import { log } from "./log.js";

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
      log.error(`${name}.failed`, { error: msg });
      return c.json(fail(`${name.replace(/\./g, "_")}_failed`, msg), 500);
    }
  };
}
