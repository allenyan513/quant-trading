import { handle } from "@/lib/api";
import { listHoldingsPositions } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listHoldingsPositions());
}
