import { handle, intParam } from "@/lib/api";
import { getOverview } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const windowHours = intParam(req, "windowHours") ?? 24;
  return handle(() => getOverview(windowHours));
}
