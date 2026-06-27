/**
 * Per-user investment memos + morning-brief archive (ported from web's `app/api/memos/*`
 * and `app/api/morning-brief`). All authed. Reads come straight from the DB; writes
 * (create/update/delete) forward to the data service (owner; it computes PIT snapshots).
 */
import type { Hono } from "hono";
import { authed, readBody, qstr, qint } from "../route.js";
import { dataPost } from "../data-proxy.js";
import { listMemos } from "@qt/shared/memo-read";
import { listMorningBriefs } from "../queries/index.js";
import { db } from "../db.js";

export function registerMemoRoutes(app: Hono): void {
  /** List the signed-in user's memos (array, for LiveTable; body omitted). */
  app.get(
    "/memos",
    authed("memos", (c, uid) =>
      listMemos(db(), uid, {
        symbol: qstr(c, "symbol"),
        type: qstr(c, "type"),
        status: qstr(c, "status"),
        limit: qint(c, "limit"),
        includeBody: false,
      }),
    ),
  );

  /** Create a memo. The data service owns the table + computes the PIT snapshot. */
  app.post(
    "/memos",
    authed("memos.submit", async (c, uid) => {
      const body = await readBody<{ type?: string; title?: string; markdown?: string; symbols?: string[]; direction?: string; status?: string }>(c);
      const title = (body.title ?? "").trim();
      if (!title) throw new Error("title required");
      const markdown = (body.markdown ?? "").trim();
      if (!markdown) throw new Error("markdown required");
      return dataPost("/memos/submit", {
        userId: uid,
        type: body.type,
        title,
        markdown,
        symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
        direction: body.direction,
        status: body.status,
      });
    }),
  );

  /** Edit a memo (title/body/status/direction/pinned, add/remove symbols). */
  app.post(
    "/memos/:id/update",
    authed("memos.update", async (c, uid) => {
      const body = await readBody<{ title?: string; markdown?: string; status?: string; direction?: string; pinned?: boolean; addSymbols?: string[]; removeSymbols?: string[] }>(c);
      return dataPost("/memos/update", {
        userId: uid,
        id: c.req.param("id"),
        title: body.title,
        markdown: body.markdown,
        status: body.status,
        direction: body.direction,
        pinned: body.pinned,
        addSymbols: body.addSymbols,
        removeSymbols: body.removeSymbols,
      });
    }),
  );

  /** Delete a memo (cascade removes its symbol links). */
  app.post("/memos/:id/delete", authed("memos.delete", (c, uid) => dataPost("/memos/delete", { userId: uid, id: c.req.param("id") })));

  /** The signed-in user's morning-brief archive (list view, no markdown body). */
  app.get("/morning-brief", authed("morning_brief", (_c, uid) => listMorningBriefs(uid)));
}
