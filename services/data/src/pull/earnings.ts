/**
 * FMP `earnings-calendar` row shape. The /pull/earnings event puller was removed
 * with the per-source triggers (news-driven pivot); this type lives on because
 * the discovery scanner (`scan/earnings.ts`) still pulls the same endpoint to
 * flag earnings-surprise candidates.
 */
export interface FmpEarning {
  symbol: string;
  date: string;
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
  /** FMP data-refresh timestamp. NOT a PIT stamp. */
  lastUpdated?: string | null;
}
