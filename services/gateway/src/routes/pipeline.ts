/**
 * Public system / pipeline reads (ported from web's `app/api/{overview,events,
 * notifications,logs,signals,positions,valuations}`). All read straight from the DB.
 */
import type { Hono } from "hono";
import { route, qstr, qint } from "../route.js";
import {
  getOverview,
  listEvents,
  listNotifications,
  listLogs,
  listSignals,
  listPositions,
  listValuations,
} from "../queries/index.js";

export function registerPipelineRoutes(app: Hono): void {
  app.get("/overview", route("overview", (c) => getOverview(qint(c, "windowHours") ?? 24)));

  app.get(
    "/events",
    route("events", (c) =>
      listEvents({
        limit: qint(c, "limit"),
        symbol: qstr(c, "symbol"),
        deliveryStatus: qstr(c, "deliveryStatus"),
        eventType: qstr(c, "eventType"),
      }),
    ),
  );

  app.get(
    "/notifications",
    route("notifications", (c) =>
      listNotifications({
        limit: qint(c, "limit"),
        symbol: qstr(c, "symbol"),
        status: qstr(c, "status"),
        deliveryStatus: qstr(c, "deliveryStatus"),
        eventType: qstr(c, "eventType"),
      }),
    ),
  );

  app.get(
    "/logs",
    route("logs", (c) =>
      listLogs({
        limit: qint(c, "limit"),
        service: qstr(c, "service"),
        level: qstr(c, "level"),
        symbol: qstr(c, "symbol"),
        event: qstr(c, "event"),
        q: qstr(c, "q"),
      }),
    ),
  );

  app.get(
    "/signals",
    route("signals", (c) => listSignals({ limit: qint(c, "limit"), symbol: qstr(c, "symbol"), status: qstr(c, "status") })),
  );

  app.get(
    "/positions",
    route("positions", (c) =>
      listPositions({ limit: qint(c, "limit"), offset: qint(c, "offset"), symbol: qstr(c, "symbol"), status: qstr(c, "status") }),
    ),
  );

  app.get(
    "/valuations",
    route("valuations", (c) => listValuations({ limit: qint(c, "limit"), symbol: qstr(c, "symbol"), status: qstr(c, "verdict") })),
  );
}
