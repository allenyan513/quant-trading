import { ValuationHero } from "@/components/valuation/valuation-hero";
import { formatCurrency, formatRatio } from "@/lib/format";
import type { ValuationSummary } from "@/types";
import type { DDMDetails } from "@/types";

interface Props {
  summary: ValuationSummary;
}

export function DDMSection({ summary }: Props) {
  const model = summary.models.find((m) => m.model_type === "ddm");

  if (!model || model.fair_value === 0) return null;

  const d = model.details as unknown as DDMDetails;

  return (
    <section id="ddm">
      <h2 className="val-h2">Dividend Discount Model</h2>

      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={summary.current_price}
        upside={model.upside_percent}
        narrative={
          <>
            Using the Two-Stage Dividend Discount Model with a Cost of Equity of{" "}
            {formatRatio(d.cost_of_equity)} and projected dividend growth of{" "}
            {formatRatio(d.near_term_growth)}, the fair value is{" "}
            {formatCurrency(model.fair_value)} per share. The DDM range is{" "}
            {formatCurrency(model.low_estimate)} – {formatCurrency(model.high_estimate)}{" "}
            based on sensitivity analysis across Cost of Equity and growth rate assumptions.
          </>
        }
      />

      {/* Dividend Profile */}
      <div className="val-card">
        <h3 className="val-card-title">Dividend Profile</h3>
        <div className="val-stats">
          <div><div className="val-stat-label">Current DPS</div><div className="val-stat-value">${d.current_dps.toFixed(2)}</div></div>
          <div><div className="val-stat-label">Dividend Yield</div><div className="val-stat-value">{(d.dividend_yield * 100).toFixed(2)}%</div></div>
          <div><div className="val-stat-label">Payout Ratio</div><div className="val-stat-value">{d.payout_ratio !== null ? formatRatio(d.payout_ratio) : "N/A"}</div></div>
          <div><div className="val-stat-label">Dividend Coverage</div><div className="val-stat-value">{d.dividend_coverage !== null ? `${d.dividend_coverage.toFixed(2)}x` : "N/A"}</div></div>
        </div>
        {d.fcf_payout_ratio !== null && (
          <div className="val-row"><span className="val-row-label">FCF Payout Ratio</span><span>{formatRatio(d.fcf_payout_ratio)}</span></div>
        )}
        {d.dps_cagr !== null && (
          <div className="val-row"><span className="val-row-label">DPS CAGR ({d.dps_cagr_years}Y)</span><span>{formatRatio(d.dps_cagr)}</span></div>
        )}
      </div>

      {/* Historical DPS */}
      {d.historical_dps.length > 0 && (
        <div className="val-card">
          <h3 className="val-card-title">Historical Dividends Per Share</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Year</th>
                  <th className="text-right py-2 px-4">DPS</th>
                  <th className="text-right py-2 px-4">Payout Ratio</th>
                  <th className="text-right py-2 pl-4">YoY Growth</th>
                </tr>
              </thead>
              <tbody>
                {[...d.historical_dps].reverse().map((h) => (
                  <tr key={h.year} className="border-b border-muted/20">
                    <td className="py-2 pr-4 font-mono">{h.year}</td>
                    <td className="py-2 px-4 text-right font-mono">{h.dps > 0 ? `$${h.dps.toFixed(2)}` : "—"}</td>
                    <td className="py-2 px-4 text-right font-mono text-muted-foreground">{h.payout_ratio !== null ? formatRatio(h.payout_ratio) : "—"}</td>
                    <td className={`py-2 pl-4 text-right font-mono ${h.yoy_growth !== null ? (h.yoy_growth >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>
                      {h.yoy_growth !== null ? `${h.yoy_growth >= 0 ? "+" : ""}${formatRatio(h.yoy_growth)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DDM Projections */}
      <div className="val-card">
        <h3 className="val-card-title">Dividend Projections (5-Year)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-4">Year</th>
                <th className="text-right py-2 px-4">Projected DPS</th>
                <th className="text-right py-2 px-4">Growth</th>
                <th className="text-right py-2 px-4">Discount Factor</th>
                <th className="text-right py-2 pl-4">Present Value</th>
              </tr>
            </thead>
            <tbody>
              {d.projections.map((p) => (
                <tr key={p.year} className="border-b border-muted/20">
                  <td className="py-2 pr-4 font-mono">{p.year}</td>
                  <td className="py-2 px-4 text-right font-mono">${p.dps.toFixed(2)}</td>
                  <td className="py-2 px-4 text-right font-mono text-muted-foreground">{formatRatio(p.growth_rate)}</td>
                  <td className="py-2 px-4 text-right font-mono text-muted-foreground">{p.discount_factor.toFixed(4)}</td>
                  <td className="py-2 pl-4 text-right font-mono">${p.pv.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-4">Terminal Value</td>
                <td className="py-2 px-4 text-right font-mono">${d.terminal_dps.toFixed(2)} DPS</td>
                <td className="py-2 px-4 text-right font-mono text-muted-foreground">{formatRatio(d.terminal_growth)}</td>
                <td className="py-2 px-4 text-right font-mono text-muted-foreground" />
                <td className="py-2 pl-4 text-right font-mono">${d.pv_terminal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-1 pt-4 border-t">
          <div className="val-row"><span className="val-row-label">PV of Projected Dividends</span><span className="font-mono">${d.pv_dividends.toFixed(2)}</span></div>
          <div className="val-row"><span className="val-row-label">PV of Terminal Value</span><span className="font-mono">${d.pv_terminal.toFixed(2)}</span></div>
          <div className="val-row val-row-primary"><span className="val-row-label">Fair Value per Share</span><span className="font-mono font-semibold">{formatCurrency(model.fair_value)}</span></div>
        </div>
      </div>

      {/* Sensitivity Matrix */}
      <div className="val-card">
        <h3 className="val-card-title">Sensitivity Analysis</h3>
        <p className="text-xs text-muted-foreground mb-4">Fair value under different Cost of Equity (rows) and DPS Growth Rate (columns) assumptions.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-2 text-left text-xs">Ke \ Growth</th>
                {d.sensitivity_matrix.growth_values.map((g, gi) => (
                  <th key={gi} className="py-2 px-2 text-right text-xs font-mono">{formatRatio(g)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.sensitivity_matrix.ke_values.map((ke, i) => {
                const isBaseKe = Math.abs(ke - d.cost_of_equity) < 0.001;
                return (
                  <tr key={i} className={`border-b border-muted/20 ${isBaseKe ? "bg-muted/20" : ""}`}>
                    <td className="py-1.5 pr-2 font-mono text-xs text-muted-foreground">{formatRatio(ke)}</td>
                    {d.sensitivity_matrix.prices[i].map((price, j) => {
                      const isBase = isBaseKe && Math.abs(d.sensitivity_matrix.growth_values[j] - d.near_term_growth) < 0.001;
                      return (
                        <td key={j} className={`py-1.5 px-2 text-right font-mono text-xs ${isBase ? "font-bold text-primary" : ""} ${price === 0 ? "text-muted-foreground" : ""}`}>
                          {price > 0 ? `$${price.toFixed(0)}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  );
}
