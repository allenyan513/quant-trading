import { formatCurrency } from "@/lib/format";

interface ValuationHeroProps {
  fairValue: number;
  fairValueLabel?: string;
  currentPrice: number;
  upside: number;
  /** Extra label next to "Fair Value" (e.g. DCF custom indicator) */
  customLabel?: React.ReactNode;
  /** SEO narrative — string or pre-rendered ReactNode */
  narrative?: React.ReactNode;
}

export function ValuationHero({
  fairValue,
  fairValueLabel = "Fair Value",
  currentPrice,
  upside,
  customLabel,
  narrative,
}: ValuationHeroProps) {
  const upsideColor = upside >= 0 ? "text-green-400" : "text-red-400";
  const verdictLabel = upside >= 0 ? "Undervalued" : "Overvalued";

  return (
    <div className="val-card">
      <div className="val-stats">
        {/* Col 1: Fair Value */}
        <div>
          <div className="val-stat-label">
            {fairValueLabel}
            {customLabel}
          </div>
          <div className="val-stat-value">{formatCurrency(fairValue)}</div>
        </div>

        {/* Col 2: Market Price */}
        <div>
          <div className="val-stat-label">Market Price</div>
          <div className="val-stat-value">{formatCurrency(currentPrice)}</div>
        </div>

        {/* Col 3: Upside / Downside */}
        <div>
          <div className="val-stat-label">Upside / Downside</div>
          <div className={`val-stat-value ${upsideColor}`}>
            {upside > 0 ? "+" : ""}
            {upside.toFixed(1)}%
          </div>
        </div>

        {/* Col 4: Verdict */}
        <div>
          <div className="val-stat-label">Verdict</div>
          <div className={`val-stat-value ${upsideColor}`}>
            {verdictLabel}
          </div>
        </div>
      </div>

      {narrative && <p className="val-prose">{narrative}</p>}
    </div>
  );
}
