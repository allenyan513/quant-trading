/**
 * 13F "legends" reads (public). web rendered these server-side via @qt/shared/
 * thirteenf-read; the SPA needs a REST surface, so expose the same read queries here.
 * Activity/Buys/Sells/History tabs are placeholders in the UI — only list + header +
 * holdings have data.
 */
import type { Hono } from "hono";
import { route } from "../route.js";
import { list13fFilers, get13fFilerHeader, list13fHoldings } from "../queries/index.js";

export function registerLegendsRoutes(app: Hono): void {
  app.get("/legends", route("legends", () => list13fFilers()));
  app.get("/legends/:cik/header", route("legends.header", (c) => get13fFilerHeader(c.req.param("cik") ?? "")));
  app.get("/legends/:cik/holdings", route("legends.holdings", (c) => list13fHoldings(c.req.param("cik") ?? "")));
}
