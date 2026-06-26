import { intParam } from "@/lib/api";
import { getOverview } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) => {
  const windowHours = intParam(req, "windowHours") ?? 24;
  return getOverview(windowHours);
});
