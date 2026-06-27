import { ValuationHero } from "@/components/valuation/valuation-hero";
import { PEGGauge } from "@/components/valuation/peg-gauge";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, money, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ValuationSummary } from "@/types";
import type { PEGDetails } from "@/types";

interface Props {
  summary: ValuationSummary;
}

export function PEGSection({ summary }: Props) {
  const model = summary.models.find((m) => m.model_type === "peg");

  if (!model || model.fair_value === 0) return null;

  const d = model.details as unknown as PEGDetails;

  return (
    <section id="peg">
      <h2 className="val-h2">PEG Fair Value</h2>

      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={summary.current_price}
        upside={model.upside_percent}
        narrative={
          <>
            Using the PEG framework with{" "}
            {d.growth_source === "forward" ? "analyst consensus forward" : "historical"}{" "}
            EPS growth of {formatRatio(d.growth_rate)}
            {d.dividend_yield > 0 && ` plus ${formatRatio(d.dividend_yield)} dividend yield`}
            , the company has a fair value of {formatCurrency(model.fair_value)} based on{" "}
            {d.eps_label} of ${d.eps_used.toFixed(2)}.
            {d.peg_ratio !== null && (
              <> The current PEG ratio is <strong className="text-foreground">{d.peg_ratio.toFixed(2)}</strong>.</>
            )}
          </>
        }
      />

      {/* PEG Gauge */}
      <div className="val-card">
        <h3 className="val-card-title">PEG Ratio</h3>
        <PEGGauge
          peg={d.peg_ratio}
          currentPE={d.current_pe}
          adjustedGrowth={d.adjusted_growth}
          dividendYield={d.dividend_yield}
          rawGrowth={d.raw_growth_rate}
        />
      </div>

      {/* Fair Value Calculation */}
      <div className="val-card">
        <h3 className="val-card-title">Fair Value Calculation</h3>
        <div className="max-w-xl">
          <table className="w-full text-sm">
            <tbody>
              <PEGRow label="EPS Growth Rate" value={formatRatio(d.raw_growth_rate)} badge={d.growth_source === "forward" ? "Forward" : "Historical"} badgeVariant={d.growth_source === "forward" ? "default" : "secondary"} />
              {d.dividend_yield > 0 && <PEGRow label="Dividend Yield" value={`+${formatRatio(d.dividend_yield)}`} />}
              <PEGRow label="Adjusted Growth (clamped 8–25%)" value={formatRatio(d.growth_rate)} badge={d.growth_clamped ? "Clamped" : undefined} />
              <PEGRow label="Fair P/E" value={`${d.fair_pe.toFixed(1)}x`} highlight />
              <PEGRow label={d.eps_label} value={`$${d.eps_used.toFixed(2)}`} highlight />
              <PEGRow label="Fair Value" value={formatCurrency(model.fair_value)} primary />
            </tbody>
          </table>
        </div>
      </div>

      {/* Growth Analysis */}
      <div className="val-card">
        <h3 className="val-card-title">Growth Analysis</h3>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Forward estimates */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              Forward Growth
              {d.growth_source === "forward" && <Badge variant="default" className="text-[10px]">Active</Badge>}
            </h4>
            {d.forward_estimates.length > 0 ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Period</th>
                      <th className="text-right py-1.5 font-medium">EPS Est.</th>
                      <th className="text-right py-1.5 font-medium">Growth</th>
                      <th className="text-right py-1.5 font-medium">Analysts</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <td className="py-1.5">FY{d.earnings_history[d.earnings_history.length - 1]?.year} (actual)</td>
                      <td className="py-1.5 text-right font-mono">${d.ttm_eps.toFixed(2)}</td>
                      <td className="py-1.5 text-right">—</td>
                      <td className="py-1.5 text-right">—</td>
                    </tr>
                    {d.forward_estimates.map((est) => (
                      <tr key={est.period} className="border-b border-muted/30">
                        <td className="py-1.5">FY{est.period}E</td>
                        <td className="py-1.5 text-right font-mono">${est.eps.toFixed(2)}</td>
                        <td className={cn("py-1.5 text-right font-mono", est.growth_pct !== null && est.growth_pct >= 0 ? "text-green-400" : "text-red-400")}>
                          {est.growth_pct !== null ? `${est.growth_pct >= 0 ? "+" : ""}${est.growth_pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">{est.analysts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.forward_growth !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {d.forward_years}Y Forward EPS CAGR: <span className="text-foreground font-medium">{formatRatio(d.forward_growth)}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No analyst estimates available.</p>
            )}
          </div>

          {/* Historical earnings */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              Historical Growth
              {d.growth_source === "historical" && <Badge variant="default" className="text-[10px]">Active</Badge>}
            </h4>
            {d.earnings_history.length > 0 && (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Year</th>
                      <th className="text-right py-1.5 font-medium">Net Income</th>
                      <th className="text-right py-1.5 font-medium">EPS</th>
                      <th className="text-right py-1.5 font-medium">YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.earnings_history.map((entry) => (
                      <tr key={entry.year} className="border-b border-muted/30">
                        <td className="py-1.5">FY{entry.year}</td>
                        <td className="py-1.5 text-right font-mono">{money(entry.net_income, "compactHeadline")}</td>
                        <td className="py-1.5 text-right font-mono">${entry.eps?.toFixed(2) ?? "—"}</td>
                        <td className={cn("py-1.5 text-right font-mono", entry.yoy_growth !== null && entry.yoy_growth >= 0 ? "text-green-400" : "text-red-400")}>
                          {entry.yoy_growth !== null ? `${entry.yoy_growth >= 0 ? "+" : ""}${entry.yoy_growth.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.historical_growth !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {d.historical_years}Y Historical EPS CAGR: <span className="text-foreground font-medium">{formatRatio(d.historical_growth)}</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </section>
  );
}

function PEGRow({ label, value, badge, badgeVariant = "secondary", highlight, primary }: {
  label: string; value: string; badge?: string; badgeVariant?: "default" | "secondary"; highlight?: boolean; primary?: boolean;
}) {
  return (
    <tr className={primary ? "border-t-2 border-brand/40" : "border-b border-muted/30"}>
      <td className={cn("py-2", primary && "font-semibold text-primary")}>
        {label}
        {badge && <Badge variant={badgeVariant} className="ml-2 text-[10px]">{badge}</Badge>}
      </td>
      <td className={cn("py-2 text-right font-mono", primary && "font-bold text-primary", highlight && "font-medium")}>{value}</td>
    </tr>
  );
}
