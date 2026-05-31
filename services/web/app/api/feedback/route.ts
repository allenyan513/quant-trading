import { handle, intParam, param } from "@/lib/api";
import { listFeedback } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listFeedback({
      limit: intParam(req, "limit"),
      symbol: param(req, "symbol"),
      eventType: param(req, "eventType"),
    }),
  );
}
