import { handle, intParam, param } from "@/lib/api";
import { listHoldingsTrades } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listHoldingsTrades({
      limit: intParam(req, "limit"),
      offset: intParam(req, "offset"),
      symbol: param(req, "symbol"),
      since: param(req, "since"),
    }),
  );
}
