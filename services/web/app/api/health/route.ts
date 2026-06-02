import { handle } from "@/lib/api";
import { getHeartbeats } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight per-service liveness for the global nav health dots.
export async function GET() {
  return handle(() => getHeartbeats());
}
