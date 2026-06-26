import { intParam, param } from "@/lib/api";
import { listNotifications } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listNotifications({
    limit: intParam(req, "limit"),
    symbol: param(req, "symbol"),
    status: param(req, "status"),
    deliveryStatus: param(req, "deliveryStatus"),
    eventType: param(req, "eventType"),
  }),
);
