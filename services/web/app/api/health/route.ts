import { getHeartbeats } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight per-service liveness for the global nav health dots.
export const GET = publicRoute(() => getHeartbeats());
