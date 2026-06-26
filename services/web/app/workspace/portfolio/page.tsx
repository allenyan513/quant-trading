import { redirect } from "next/navigation";
import { getHoldingsStatus } from "@/lib/queries";
import { getUser } from "@/lib/session";

// Reads the DB (connection status) to pick the landing tab, so it must render
// per-request — never statically prerendered at build (no DATABASE_URL then).
export const dynamic = "force-dynamic";

/**
 * Bare /data/holdings → land on Settings when not yet connected (you need to
 * paste credentials first), otherwise Performance. Server component, so the
 * redirect is safe (no client-tree React #310).
 */
export default async function HoldingsIndex() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const status = await getHoldingsStatus(user.id);
  redirect(status.connected ? "/workspace/portfolio/live/performance" : "/workspace/portfolio/live/settings");
}
