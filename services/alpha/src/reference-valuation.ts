/**
 * Reference valuation (System A) client. The deterministic valuation engine moved
 * to the data service (it's computed from data-owned marketdata caches), so alpha
 * fetches the reference valuation over HTTP and feeds it to the LLM repricing as
 * one input. data reuses a fresh snapshot within its TTL; forceRefresh on earnings
 * (the financials just changed).
 */
import { config, type ReferenceValuation } from "@qt/shared";

export async function fetchReferenceValuation(
  symbol: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<ReferenceValuation> {
  const resp = await fetch(`${config.dataUrl()}/internal/valuation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol, forceRefresh: opts.forceRefresh ?? false }),
  });
  const json = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: ReferenceValuation;
    error?: string;
  };
  if (!resp.ok || !json.ok || !json.data) {
    throw new Error(json.error ?? `data /internal/valuation returned ${resp.status}`);
  }
  return json.data;
}
