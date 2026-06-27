/**
 * Per-user IBKR holdings (ported from web's `app/api/holdings/*`). All authed. Reads
 * come from the DB scoped to the session user; writes (save credentials, trigger sync)
 * forward to the portfolio service, which owns the account + encrypts the Flex token.
 */
import type { Hono } from "hono";
import { authed, readBody, qstr, qint } from "../route.js";
import { portfolioPost } from "../portfolio-proxy.js";
import { getHoldingsStatus, getHoldingsNav, listHoldingsPositions, listHoldingsTrades } from "../queries/index.js";

export function registerHoldingsRoutes(app: Hono): void {
  /** Connection status for the signed-in user (never returns the token). */
  app.get("/holdings/credentials", authed("holdings.credentials", (_c, uid) => getHoldingsStatus(uid)));

  /** Save/update this user's IBKR Flex credentials — portfolio owns the write (encrypts
   *  the token), so forward with the user's id as the account id. */
  app.post(
    "/holdings/credentials",
    authed("holdings.credentials.save", async (c, uid) => {
      const body = await readBody<{ token?: string; queryId?: string }>(c);
      const token = (body.token ?? "").trim();
      const queryId = (body.queryId ?? "").trim();
      if (!token || !queryId) throw new Error("token and queryId are required");
      return portfolioPost("/holdings/credentials", { accountId: uid, token, queryId });
    }),
  );

  app.get("/holdings/nav", authed("holdings.nav", (_c, uid) => getHoldingsNav(uid)));
  app.get("/holdings/positions", authed("holdings.positions", (_c, uid) => listHoldingsPositions(uid)));

  app.get(
    "/holdings/trades",
    authed("holdings.trades", (c, uid) =>
      listHoldingsTrades(uid, { limit: qint(c, "limit"), offset: qint(c, "offset"), symbol: qstr(c, "symbol"), since: qstr(c, "since") }),
    ),
  );

  /** Trigger a sync of THIS user's holdings — portfolio owns the work. */
  app.post("/holdings/sync", authed("holdings.sync", (_c, uid) => portfolioPost("/holdings/sync", { accountId: uid })));
}
