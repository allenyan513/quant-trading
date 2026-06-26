import { intParam, param } from "@/lib/api";
import { listPositions } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listPositions({
    limit: intParam(req, "limit"),
    offset: intParam(req, "offset"),
    symbol: param(req, "symbol"),
    status: param(req, "status"),
  }),
);
