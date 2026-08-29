/**
 * Replay game — a single public, read-only forward to data's dataset builder.
 *
 * Deliberately thin: the game keeps no server state. The browser holds the whole
 * simulation (cash, position, the hidden end date), so there is nothing per-user here
 * and nothing to authenticate — the page is open to anyone, which is the point.
 */
import type { Hono } from "hono";
import { route } from "../route.js";
import { dataGet } from "../data-proxy.js";
import type { GameDataset } from "@qt/shared/game";

/** A cold build fans out to FMP + SEC + three macro series; 10s isn't enough. */
const DATASET_TIMEOUT_MS = 60_000;

export function registerGameRoutes(app: Hono): void {
  app.get(
    "/game/dataset",
    route("game.dataset", (c) => {
      const symbol = (c.req.query("symbol") || "").trim();
      return dataGet<GameDataset>(`/game/dataset?symbol=${encodeURIComponent(symbol)}`, DATASET_TIMEOUT_MS);
    }),
  );
}
