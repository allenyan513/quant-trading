/**
 * The FIRE calculator's inputs, and how they travel in the query string.
 *
 * Same discipline as the backtest tool: a run someone wants to keep or send to
 * someone else has to survive a reload, so the seven numbers that define it live
 * in the URL rather than in component state alone.
 *
 * Everything here is pure and synchronous — the whole tool is arithmetic in the
 * browser, with no API call at any point. That is also what makes the page safe
 * to prerender: `inputsFromParams(new URLSearchParams())` returns exactly
 * `DEFAULTS`, so the build-time render and a cold visit agree.
 */

export interface FireInputs {
  /** Lump-sum starting balance. */
  p0: number;
  /** Nominal dollars added each month, held flat (not inflated). */
  monthly: number;
  /** Target monthly spend in TODAY's dollars; the sim inflates it. */
  spend: number;
  /** Annual mean return. */
  mu: number;
  /** Annual volatility (standard deviation of returns). */
  sigma: number;
  /** Safe withdrawal rate. The FI target is `spend × 12 ÷ swr`. */
  swr: number;
  /** Annual inflation. */
  inflation: number;
}

export const DEFAULTS: FireInputs = {
  p0: 200_000,
  monthly: 1_000,
  spend: 5_000,
  mu: 0.1,
  sigma: 0.16,
  swr: 0.04,
  inflation: 0.03,
};

/**
 * Slider ranges for the four rate assumptions.
 *
 * These are also the CLAMP applied when parsing the URL, which is the point: a
 * hand-edited `?sigma=99` would otherwise reach `runMC` and spend a minute
 * producing nonsense. The form can't express an out-of-range value, so neither
 * can a link.
 */
export const BOUNDS = {
  mu: { min: 0.04, max: 0.15, step: 0.005 },
  sigma: { min: 0.08, max: 0.25, step: 0.01 },
  swr: { min: 0.025, max: 0.06, step: 0.0025 },
  inflation: { min: 0, max: 0.06, step: 0.005 },
} as const;

/** Ceiling on the three money fields — high enough that nobody hits it honestly,
 *  low enough that a junk URL can't ask for a balance that overflows the chart. */
const MAX_MONEY = 1e10;

/** Query-string key per field. Short, because these end up in shared links. */
const KEYS: Record<keyof FireInputs, string> = {
  p0: "p0",
  monthly: "m",
  spend: "spend",
  mu: "mu",
  sigma: "sigma",
  swr: "swr",
  inflation: "infl",
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Parse one key, falling back to its default on anything non-finite. */
function num(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

/**
 * URL → inputs. Every field degrades to its default independently, so a partial
 * or malformed query still renders a usable page rather than an error.
 */
export function inputsFromParams(params: URLSearchParams): FireInputs {
  return {
    p0: Math.round(num(params, KEYS.p0, DEFAULTS.p0, 0, MAX_MONEY)),
    monthly: Math.round(num(params, KEYS.monthly, DEFAULTS.monthly, 0, MAX_MONEY)),
    spend: Math.round(num(params, KEYS.spend, DEFAULTS.spend, 0, MAX_MONEY)),
    mu: num(params, KEYS.mu, DEFAULTS.mu, BOUNDS.mu.min, BOUNDS.mu.max),
    sigma: num(params, KEYS.sigma, DEFAULTS.sigma, BOUNDS.sigma.min, BOUNDS.sigma.max),
    swr: num(params, KEYS.swr, DEFAULTS.swr, BOUNDS.swr.min, BOUNDS.swr.max),
    inflation: num(params, KEYS.inflation, DEFAULTS.inflation, BOUNDS.inflation.min, BOUNDS.inflation.max),
  };
}

/**
 * Inputs → URL. Writes ALL seven rather than only what differs from the default,
 * so a shared link keeps meaning the same run even if the defaults are retuned
 * later. The page only calls this from an input handler, which is why a visitor
 * who changes nothing still sees a clean, parameter-free URL.
 */
export function paramsFromInputs(i: FireInputs): Record<string, string> {
  return {
    [KEYS.p0]: String(i.p0),
    [KEYS.monthly]: String(i.monthly),
    [KEYS.spend]: String(i.spend),
    [KEYS.mu]: String(i.mu),
    [KEYS.sigma]: String(i.sigma),
    [KEYS.swr]: String(i.swr),
    [KEYS.inflation]: String(i.inflation),
  };
}

/** `0.152` → `"15.2%"`. The four assumptions all render through this. */
export const fmtRate = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Whole dollars with separators; "—" for anything not finite. */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

/** Short money for axis ticks and big headline figures: `$3.1M`, `$940K`. */
export function fmtMoneyShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
