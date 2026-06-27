import { MethodologyCard } from "@/components/valuation/methodology-card";
import { money } from "@/lib/format";
import type { WACCResult } from "@/types";

const METHODOLOGY = [
  "WACC is the discount rate used in all DCF models on this platform. It blends the cost of equity (CAPM) and after-tax cost of debt, weighted by market-cap-based capital structure.",
  "Beta is derived using the bottom-up (sector) approach: peer betas are unlevered, the sector median is taken, then re-levered with the target company's own D/E ratio. This produces more stable betas than individual stock regression. Bloomberg adjustment (0.67 × β + 0.33 × 1.0) accounts for mean reversion.",
];

interface Props {
  wacc: WACCResult;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`val-row ${highlight ? "val-row-highlight" : ""}`}>
      <span className="val-row-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function WACCSection({ wacc: w }: Props) {
  const isBottomUp = w.beta_method === "bottom_up";
  const individualBeta = w.beta ? Math.max(0.3, 0.67 * w.beta + 0.33 * 1.0) : null;
  const equityComponent = w.equity_weight * w.cost_of_equity;
  const debtComponent = w.debt_weight * w.cost_of_debt * (1 - w.tax_rate);

  return (
    <section id="wacc">
      <h2 className="val-h2">WACC</h2>

      <div className="val-card">
        {/* WACC Result */}
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Weighted Average Cost of Capital</div>
          <div className="text-4xl font-bold mt-1">{pct(w.wacc)}</div>
        </div>

        {/* Beta Insight Card */}
        {isBottomUp && individualBeta != null && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm max-w-lg">
            <div className="font-medium mb-2">Beta Method: Bottom-Up Sector Beta</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Individual Beta (FMP)</span>
                <span className="line-through text-muted-foreground">{individualBeta.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bottom-Up Sector Beta</span>
                <span className="font-medium">{w.beta.toFixed(2)}</span>
              </div>
              {individualBeta !== w.beta && (
                <div className="text-xs text-muted-foreground mt-1">
                  {w.beta < individualBeta
                    ? `Bottom-up beta is ${pct((individualBeta - w.beta) / individualBeta)} lower — removes stock price noise by using the sector peer median.`
                    : `Bottom-up beta is ${pct((w.beta - individualBeta) / individualBeta)} higher — company's leverage amplifies the sector beta.`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cost of Equity (CAPM) */}
        <div>
          <h3 className="val-h3">Cost of Equity (CAPM)</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Risk-Free Rate (10Y Treasury)" value={pct(w.risk_free_rate)} />
            {isBottomUp && w.sector_unlevered_beta != null ? (
              <>
                <Row label="Sector Median Unlevered Beta" value={w.sector_unlevered_beta.toFixed(3)} />
                <Row label="Beta (β) — Bottom-Up Sector Beta" value={w.beta.toFixed(2)} />
                <div className="text-xs text-muted-foreground">
                  Re-levered with company D/E, then Bloomberg adjusted (0.67 × β + 0.33 × 1.0)
                </div>
              </>
            ) : (
              <Row label="Beta (β) — Bloomberg Adjusted" value={w.beta.toFixed(2)} />
            )}
            <Row label="Equity Risk Premium (ERP)" value={pct(w.erp)} />
            {w.additional_risk_premium > 0 && (
              <Row label="Additional Risk Premium" value={pct(w.additional_risk_premium)} />
            )}
            <div className="border-t my-2" />
            <Row label="Ke = Rf + β × ERP" value={pct(w.cost_of_equity)} highlight />
            <div className="text-xs text-muted-foreground mt-1">
              = {pct(w.risk_free_rate)} + {w.beta.toFixed(2)} × {pct(w.erp)}
              {w.additional_risk_premium > 0 ? ` + ${pct(w.additional_risk_premium)}` : ""}
            </div>
          </div>
        </div>

        {/* Cost of Debt */}
        <div>
          <h3 className="val-h3">Cost of Debt</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Pre-tax Cost of Debt (Kd)" value={pct(w.cost_of_debt)} />
            <Row label="Tax Rate" value={pct(w.tax_rate)} />
            <div className="border-t my-2" />
            <Row label="After-tax Kd = Kd × (1 − t)" value={pct(w.cost_of_debt * (1 - w.tax_rate))} highlight />
          </div>
        </div>

        {/* Capital Structure */}
        <div>
          <h3 className="val-h3">Capital Structure</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Equity (Market Cap)" value={money(w.total_equity, "compactHeadline", { decimals: 1 })} />
            <Row label="Debt" value={money(w.total_debt, "compactHeadline", { decimals: 1 })} />
            <div className="border-t my-2" />
            <Row label="Equity Weight (E / V)" value={pct(w.equity_weight)} highlight />
            <Row label="Debt Weight (D / V)" value={pct(w.debt_weight)} highlight />
          </div>
          <div className="flex rounded-full overflow-hidden h-3 mt-3 max-w-lg">
            <div className="bg-primary" style={{ width: `${w.equity_weight * 100}%` }} title={`Equity: ${pct(w.equity_weight)}`} />
            <div className="bg-muted-foreground/30" style={{ width: `${w.debt_weight * 100}%` }} title={`Debt: ${pct(w.debt_weight)}`} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-lg">
            <span>Equity {pct(w.equity_weight)}</span>
            <span>Debt {pct(w.debt_weight)}</span>
          </div>
        </div>

        {/* WACC Composition */}
        <div>
          <h3 className="val-h3">WACC Composition</h3>
          <div className="max-w-lg space-y-2">
            <div className="flex rounded-lg overflow-hidden h-8">
              <div className="bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground" style={{ width: `${Math.max((equityComponent / (equityComponent + debtComponent)) * 100, 8)}%` }}>
                {pct(equityComponent)}
              </div>
              {debtComponent > 0.0002 && (
                <div className="bg-primary/40 flex items-center justify-center text-xs font-medium" style={{ width: `${Math.max((debtComponent / (equityComponent + debtComponent)) * 100, 8)}%` }}>
                  {pct(debtComponent)}
                </div>
              )}
            </div>
            <div className="flex text-xs text-muted-foreground gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
                Equity: {pct(w.equity_weight)} × {pct(w.cost_of_equity)}
              </div>
              {debtComponent > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-primary/40 inline-block" />
                  Debt: {pct(w.debt_weight)} × {pct(w.cost_of_debt)} × (1−{pct(w.tax_rate)})
                </div>
              )}
            </div>
            <div className="flex justify-between text-sm font-medium pt-1 border-t">
              <span>WACC</span>
              <span className="text-primary">{pct(w.wacc)}</span>
            </div>
          </div>
        </div>
      </div>

      <MethodologyCard paragraphs={METHODOLOGY} />
    </section>
  );
}
