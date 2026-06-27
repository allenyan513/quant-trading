/**
 * Discovery: candidate queue + scanner + news staging (ported from web's
 * `app/api/{candidates,scan,news}`). Reads come from the DB; writes forward to the data
 * service (owner of data_candidates / data_news_items). These were cookie-auth'd in web;
 * here they stay open (the SPA gates the pages) — no per-user data is involved.
 */
import type { Hono } from "hono";
import { route, readBody, qstr, qint } from "../route.js";
import { dataPost } from "../data-proxy.js";
import { listCandidates, listNews } from "../queries/index.js";

export function registerDiscoverRoutes(app: Hono): void {
  // ---- Candidates (discovery queue) ----
  app.get(
    "/candidates",
    route("candidates", (c) => listCandidates({ limit: qint(c, "limit"), offset: qint(c, "offset"), status: qstr(c, "status") })),
  );

  app.post(
    "/candidates/promote",
    route("candidates.promote", async (c) => {
      const symbol = (await readBody<{ symbol?: string }>(c)).symbol?.trim() ?? "";
      if (!symbol) throw new Error("symbol required");
      await dataPost("/candidates/promote", { symbol });
      return { symbol, promoted: true };
    }),
  );

  app.post(
    "/candidates/dismiss",
    route("candidates.dismiss", async (c) => {
      const symbol = (await readBody<{ symbol?: string }>(c)).symbol?.trim() ?? "";
      if (!symbol) throw new Error("symbol required");
      await dataPost("/candidates/dismiss", { symbol });
      return { symbol, dismissed: true };
    }),
  );

  // Trigger the XBRL Frames fundamental screener on demand (data owns /scan/*).
  app.post(
    "/scan/fundamentals",
    route("scan.fundamentals", async (c) => dataPost("/scan/fundamentals", await readBody<Record<string, unknown>>(c))),
  );

  // ---- News (staging → triage → notify) ----
  app.get(
    "/news",
    route("news", (c) =>
      listNews({
        limit: qint(c, "limit"),
        offset: qint(c, "offset"),
        symbol: qstr(c, "symbol"),
        status: qstr(c, "status"),
        category: qstr(c, "category"),
        priority: qstr(c, "priority"),
      }),
    ),
  );

  // data owns the FMP pull + news_items write / screen + LLM triage; just forward + relay counts.
  app.post("/news/pull", route("news.pull", async (c) => dataPost("/news/pull", await readBody<Record<string, unknown>>(c))));
  app.post("/news/triage", route("news.triage", async (c) => dataPost("/news/triage", await readBody<Record<string, unknown>>(c))));

  // Materialize selected staged-news ids into events + notify alpha (write happens in data).
  app.post(
    "/news/notify",
    route("news.notify", async (c) => {
      const body = await readBody<{ ids?: unknown; symbolOverride?: unknown }>(c);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids.length === 0) throw new Error("ids required");
      return dataPost("/news/notify", { ids, symbolOverride: body.symbolOverride ?? {} });
    }),
  );
}
