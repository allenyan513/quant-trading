import { handle, intParam, param } from "@/lib/api";
import { listHoldingsTrades } from "@/lib/queries";
import { requireUserOr401 } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await requireUserOr401();
  if (typeof uid !== "string") return uid;
  return handle(() =>
    listHoldingsTrades(uid, {
      limit: intParam(req, "limit"),
      offset: intParam(req, "offset"),
      symbol: param(req, "symbol"),
      since: param(req, "since"),
    }),
  );
}
