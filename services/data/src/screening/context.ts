/**
 * Gathers the facts a screen needs, once per news row, so rules stay pure and
 * share the work. The profile fetch (market cap / sector / exchange) doubles as
 * universe warming — getProfile upserts `data_universe` as a side effect. The
 * loader is injectable so the orchestrator can memoize it per run (one profile
 * call per symbol even when a symbol has several news items in the batch).
 */
import { marketdata } from "@qt/shared";
import type { NewsRow, ScreenContext } from "./types.js";

export type ProfileLoader = (symbol: string) => Promise<Record<string, unknown> | null>;

export async function buildScreenContext(
  news: NewsRow,
  loadProfile: ProfileLoader = marketdata.getProfile,
): Promise<ScreenContext> {
  const symbol = news.symbol ? news.symbol.trim().toUpperCase() || null : null;
  // No symbol → no profile (require_symbol will reject); skip the FMP call.
  const profile = symbol ? await loadProfile(symbol) : null;
  return { news, symbol, profile };
}
