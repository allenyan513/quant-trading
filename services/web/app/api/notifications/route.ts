import { handle, intParam, param } from "@/lib/api";
import { listNotifications } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(() =>
    listNotifications({
      limit: intParam(req, "limit"),
      symbol: param(req, "symbol"),
      status: param(req, "status"),
      deliveryStatus: param(req, "deliveryStatus"),
      eventType: param(req, "eventType"),
    }),
  );
}
