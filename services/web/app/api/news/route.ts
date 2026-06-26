import { intParam, param } from "@/lib/api";
import { listNews } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listNews({
    limit: intParam(req, "limit"),
    offset: intParam(req, "offset"),
    symbol: param(req, "symbol"),
    status: param(req, "status"),
    category: param(req, "category"),
    priority: param(req, "priority"),
  }),
);
