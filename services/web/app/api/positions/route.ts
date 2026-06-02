import { handle, intParam, param } from "@/lib/api";
import { listPositions } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listPositions({
      limit: intParam(req, "limit"),
      offset: intParam(req, "offset"),
      symbol: param(req, "symbol"),
      status: param(req, "status"),
    }),
  );
}
