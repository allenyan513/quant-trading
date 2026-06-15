import { redirect } from "next/navigation";
import { getHoldingsStatus } from "@/lib/queries";

// Reads the DB (connection status) to pick the landing tab, so it must render
// per-request — never statically prerendered at build (no DATABASE_URL then).
export const dynamic = "force-dynamic";

/**
 * Bare /data/holdings → land on Settings when not yet connected (you need to
 * paste credentials first), otherwise Performance. Server component, so the
 * redirect is safe (no client-tree React #310).
 */
export default async function HoldingsIndex() {
  const status = await getHoldingsStatus();
  redirect(status.connected ? "/data/holdings/performance" : "/data/holdings/settings");
}
