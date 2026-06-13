/**
 * Rate-limited FMP client. Ported from
 * `legends/quant-researcher/quant_researcher/data/fmp.py`:
 *  - sliding-window token bucket (default 250 req / 60s)
 *  - retry with exponential backoff on 429/5xx
 *  - soft-fail (return null) on 402 premium-gated endpoints
 *  - hard-fail (throw) on network / other errors
 */
import { config } from "./config.js";

const WINDOW_MS = 60_000;
const timestamps: number[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const limit = config.fmpRateLimit();
  const now = Date.now();
  while (timestamps.length && now - timestamps[0]! >= WINDOW_MS) timestamps.shift();
  if (timestamps.length >= limit) {
    await sleep(WINDOW_MS - (now - timestamps[0]!));
    return throttle();
  }
  timestamps.push(Date.now());
}

export class FmpSoftError extends Error {}

export interface FmpGetOptions {
  /** If true, a 402 (premium-gated) returns null instead of throwing. */
  softFail402?: boolean;
}

/**
 * GET an FMP `stable` endpoint. `path` is relative, e.g. "profile".
 * Query params are appended; the API key is injected automatically.
 */
export async function fmpGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: FmpGetOptions = {},
): Promise<T | null> {
  const url = new URL(`${config.fmpBaseUrl()}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("apikey", config.fmpApiKey());

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await throttle();
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      await sleep(2 ** attempt * 1000 + Math.random() * 500);
      continue;
    }

    if (resp.ok) return (await resp.json()) as T;

    if (resp.status === 402) {
      if (opts.softFail402) return null;
      throw new FmpSoftError(`FMP 402 (premium-gated): ${path}`);
    }
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt === maxAttempts - 1) {
        throw new Error(`FMP ${resp.status} after ${maxAttempts} attempts: ${path}`);
      }
      await sleep(2 ** attempt * 1000 + Math.random() * 500);
      continue;
    }
    throw new Error(`FMP ${resp.status}: ${path} — ${await resp.text()}`);
  }
  return null;
}
