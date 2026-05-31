import { handle, intParam, param } from "@/lib/api";
import { listLogs } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listLogs({
      limit: intParam(req, "limit"),
      service: param(req, "service"),
      level: param(req, "level"),
      symbol: param(req, "symbol"),
      event: param(req, "event"),
      q: param(req, "q"),
    }),
  );
}
