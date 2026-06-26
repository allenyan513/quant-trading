import { intParam, param } from "@/lib/api";
import { listCandidates } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) =>
  listCandidates({
    limit: intParam(req, "limit"),
    offset: intParam(req, "offset"),
    status: param(req, "status"),
  }),
);
