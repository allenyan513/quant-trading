import { intParam, param } from "@/lib/api";
import { listEvents } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listEvents({
    limit: intParam(req, "limit"),
    symbol: param(req, "symbol"),
    deliveryStatus: param(req, "deliveryStatus"),
    eventType: param(req, "eventType"),
  }),
);
