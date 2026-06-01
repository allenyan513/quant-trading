import { handle, intParam, param } from "@/lib/api";
import { listCandidates } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listCandidates({
      limit: intParam(req, "limit"),
      offset: intParam(req, "offset"),
      status: param(req, "status"),
    }),
  );
}
