import { intParam, param } from "@/lib/api";
import { listLogs } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listLogs({
    limit: intParam(req, "limit"),
    service: param(req, "service"),
    level: param(req, "level"),
    symbol: param(req, "symbol"),
    event: param(req, "event"),
    q: param(req, "q"),
  }),
);
