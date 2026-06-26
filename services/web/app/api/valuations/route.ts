import { intParam, param } from "@/lib/api";
import { listValuations } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listValuations({
    limit: intParam(req, "limit"),
    symbol: param(req, "symbol"),
    status: param(req, "verdict"),
  }),
);
