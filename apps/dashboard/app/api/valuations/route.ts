import { handle, intParam, param } from "@/lib/api";
import { listValuations } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listValuations({
      limit: intParam(req, "limit"),
      symbol: param(req, "symbol"),
      status: param(req, "verdict"),
    }),
  );
}
