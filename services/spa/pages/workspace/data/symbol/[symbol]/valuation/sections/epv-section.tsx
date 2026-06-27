import { ValuationHero } from "@/components/valuation/valuation-hero";
import { EPVBreakdown } from "@/components/valuation/epv-breakdown";
import { formatCurrency, formatLargeNumber, formatRatio } from "@/lib/format";
import type { ValuationSummary } from "@/types";
import type { EPVDetails } from "@/types";

interface Props {
  summary: ValuationSummary;
}

export function EPVSection({ summary }: Props) {
  const model = summary.models.find((m) => m.model_type === "epv");

  if (!model || model.fair_value === 0) return null;

  const d = model.details as unknown as EPVDetails;

  return (
    <section id="epv">
      <h2 className="val-h2">Earnings Power Value</h2>

      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={summary.current_price}
        upside={model.upside_percent}
        narrative={
          <>
            Using the Earnings Power Value framework with a WACC of{" "}
            {formatRatio(d.wacc)} and normalized earnings of{" "}
            {formatLargeNumber(d.normalized_earnings, { prefix: "$" })}, the company has a
            fair value of {formatCurrency(model.fair_value)} per share.
            The EPV range is {formatCurrency(model.low_estimate)} –{" "}
            {formatCurrency(model.high_estimate)} based on WACC sensitivity
            ({formatRatio(d.wacc_low)} – {formatRatio(d.wacc_high)}).
          </>
        }
      />

      <EPVBreakdown details={d} model={model} />
    </section>
  );
}
