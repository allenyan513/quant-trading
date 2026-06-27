/**
 * Onboarding status for the dashboard "getting started" home — which of the three
 * setup steps the signed-in user has completed. All read-only, per-user.
 */
import { count, eq } from "drizzle-orm";
import { db, watchlist, oauthAccessToken } from "../db.js";
import { getHoldingsStatus } from "./holdings.js";

export interface OnboardingStatus {
  ibkrConnected: boolean;
  watchlistCount: number;
  /** Has ever obtained an MCP OAuth token (i.e. connected their Claude at least once). */
  claudeConnected: boolean;
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const [holdings, wl, tok] = await Promise.all([
    getHoldingsStatus(userId),
    db().select({ c: count() }).from(watchlist).where(eq(watchlist.userId, userId)),
    db().select({ c: count() }).from(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)),
  ]);
  return {
    ibkrConnected: holdings.connected,
    watchlistCount: Number(wl[0]?.c ?? 0),
    claudeConnected: Number(tok[0]?.c ?? 0) > 0,
  };
}
