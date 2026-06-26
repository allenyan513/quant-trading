import { intParam, param } from "@/lib/api";
import { listHoldingsTrades } from "@/lib/queries";
import { authedRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = authedRoute((uid, req) =>
  listHoldingsTrades(uid, {
    limit: intParam(req, "limit"),
    offset: intParam(req, "offset"),
    symbol: param(req, "symbol"),
    since: param(req, "since"),
  }),
);
