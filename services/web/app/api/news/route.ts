import { handle, intParam, param } from "@/lib/api";
import { listNews } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listNews({
      limit: intParam(req, "limit"),
      offset: intParam(req, "offset"),
      symbol: param(req, "symbol"),
      status: param(req, "status"),
      category: param(req, "category"),
    }),
  );
}
