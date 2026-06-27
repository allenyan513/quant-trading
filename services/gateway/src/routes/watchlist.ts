/**
 * Per-user watchlist + groups (ported from web's `app/api/watchlist/*`). All authed.
 * data owns the table (T12): reads come from the DB scoped to the session user (with the
 * valuation/position join); writes forward to the data service. uid always from session.
 */
import type { Hono } from "hono";
import { authed, readBody } from "../route.js";
import { dataPost } from "../data-proxy.js";
import { listWatchlistOverview, listUserWatchlistLists } from "../queries/index.js";

export function registerWatchlistRoutes(app: Hono): void {
  // ---- Groups (tabs) — register the static/deeper paths first ----
  app.post(
    "/watchlist/lists/reorder",
    authed("watchlist.lists.reorder", async (c, uid) => {
      const ids = ((await readBody<{ ids?: unknown }>(c)).ids as unknown[] | undefined)?.map((x) => String(x)) ?? [];
      if (ids.length === 0) throw new Error("ids required");
      return dataPost("/watchlist/lists/reorder", { userId: uid, ids });
    }),
  );

  app.patch(
    "/watchlist/lists/:id",
    authed("watchlist.lists.rename", async (c, uid) => {
      const name = (await readBody<{ name?: string }>(c)).name?.trim() ?? "";
      if (!name) throw new Error("name required");
      return dataPost("/watchlist/lists/rename", { userId: uid, id: c.req.param("id"), name });
    }),
  );

  app.delete(
    "/watchlist/lists/:id",
    authed("watchlist.lists.delete", (c, uid) => dataPost("/watchlist/lists/delete", { userId: uid, id: c.req.param("id") })),
  );

  app.get("/watchlist/lists", authed("watchlist.lists", (_c, uid) => listUserWatchlistLists(uid)));

  app.post(
    "/watchlist/lists",
    authed("watchlist.lists.create", async (c, uid) => {
      const name = (await readBody<{ name?: string }>(c)).name?.trim() ?? "";
      if (!name) throw new Error("name required");
      return dataPost("/watchlist/lists/create", { userId: uid, name });
    }),
  );

  app.post(
    "/watchlist/assign",
    authed("watchlist.assign", async (c, uid) => {
      const body = await readBody<{ symbol?: string; listId?: string | null }>(c);
      const symbol = (body.symbol ?? "").trim();
      if (!symbol) throw new Error("symbol required");
      return dataPost("/watchlist/assign", { userId: uid, symbol, listId: body.listId ?? null });
    }),
  );

  // ---- Watchlist itself ----
  app.get("/watchlist", authed("watchlist", (_c, uid) => listWatchlistOverview(uid)));

  app.post(
    "/watchlist",
    authed("watchlist.add", async (c, uid) => {
      const { symbol, note } = await readBody<{ symbol?: string; note?: string }>(c);
      const s = (symbol ?? "").trim();
      if (!s) throw new Error("symbol required");
      return dataPost("/watchlist", { userId: uid, symbol: s, note });
    }),
  );

  app.delete(
    "/watchlist/:symbol",
    authed("watchlist.remove", (c, uid) => dataPost("/watchlist/remove", { userId: uid, symbol: c.req.param("symbol") })),
  );
}
