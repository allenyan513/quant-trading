"use client";

import type { ValuationResult } from "@/types";
import type { RevenueDCFProjectionYear } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";
import { ValuationHero } from "./valuation-hero";
import { formatMillions, formatCurrency, formatRatio } from "@/lib/format";
import { Card } from "@/components/ui/card";

// --- Component ---

interface Props {
  model: ValuationResult;
  currentPrice: number;
  companyName: string;
  ticker: string;
}

export function RevenueDCFCards({ model, currentPrice, companyName, ticker }: Props) {
  const details = model.details as Record<string, unknown>;
  const assumptions = model.assumptions as Record<string, unknown>;

  const projections = details.projections as RevenueDCFProjectionYear[];
  const terminalValue = details.terminal_value as number;
  const pvTerminalValue = details.pv_terminal_value as number;
  const pvFcffTotal = details.pv_fcff_total as number;
  const enterpriseValue = details.enterprise_value as number;
  const netDebt = details.net_debt as number;
  const equityValue = details.equity_value as number;
  const sharesOutstanding = details.shares_outstanding as number;

  const sensitivity = details.sensitivity_matrix as {
    discount_rate_values: number[];
    margin_values: number[];
    prices: number[][];
  };

  const currentMargin = assumptions.current_operating_margin as number;
  const targetMargin = assumptions.target_operating_margin as number;
  const wacc = assumptions.wacc as number;
  const terminalGrowthRate = assumptions.terminal_growth_rate as number;
  const taxRate = assumptions.tax_rate as number;
  const daPct = assumptions.da_pct as number;
  const historicalCapexPct = assumptions.historical_capex_pct as number;
  const targetCapexPct = assumptions.target_capex_pct as number;
  const nwcPct = assumptions.nwc_pct as number;

  const upside = model.upside_percent;

  const fmtM = (v: number) => formatMillions(v);

  return (
    <div className="val-page">
      <h2 className="val-h2">
        {companyName} ({ticker}) Revenue DCF (5Y)
      </h2>

      {/* Hero */}
      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={currentPrice}
        upside={upside}
        fairValueLabel="REVENUE DCF FAIR VALUE"
        narrative={
          <>
            Using a Revenue DCF model with operating margin convergence from{" "}
            {formatRatio(currentMargin)} to a target of {formatRatio(targetMargin)} over 5 years,
            discounted at a WACC of {formatRatio(wacc)},{" "}
            {companyName} ({ticker}) has an intrinsic value of{" "}
            {formatCurrency(model.fair_value)} per share (range:{" "}
            {formatCurrency(model.low_estimate)} – {formatCurrency(model.high_estimate)}).
          </>
        }
      />

      {/* Key Assumptions */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="val-card-title">Key Assumptions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <AssumptionItem label="Current Operating Margin" value={formatRatio(currentMargin)} />
          <AssumptionItem label="Target Operating Margin" value={formatRatio(targetMargin)} />
          <AssumptionItem label="WACC" value={formatRatio(wacc)} />
          <AssumptionItem label="Terminal Growth Rate" value={formatRatio(terminalGrowthRate)} />
          <AssumptionItem label="Historical CapEx/Rev" value={formatRatio(historicalCapexPct)} />
          <AssumptionItem label="Target CapEx/Rev" value={formatRatio(targetCapexPct)} />
          <AssumptionItem label="D&A/Revenue" value={formatRatio(daPct)} />
          <AssumptionItem label="Tax Rate" value={formatRatio(taxRate)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Operating margin fades linearly from the current level to the industry target over the
          5-year projection. CapEx intensity fades from the historical average to a maintenance
          level (D&A × 1.5). Tax is only applied when operating income is positive (NOL shield).
        </p>
      </Card>

      {/* Margin Convergence Projection */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="val-card-title">Margin Convergence Projection</h3>
        <p className="text-xs text-muted-foreground mb-2">USD in millions. Mid-year discounting convention.</p>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full whitespace-nowrap text-xs sm:text-sm">
            <thead>
              <tr className="border-b-2 border-brand/40 text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-2 pr-3 sm:pr-4 font-medium sticky left-0 bg-card z-10">Year</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">Revenue</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">Growth</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">Op Margin</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">Op Income</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">NOPAT</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">D&A</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">CapEx</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">ΔNWC</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">FCFF</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium">PV(FCFF)</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.year} className="border-b border-muted/20 hover:bg-muted/10">
                  <td className="py-2 pr-3 sm:pr-4 font-medium sticky left-0 bg-card z-10">{p.year}</td>
                  <td className="py-2 px-2 sm:px-3 text-right font-mono">{fmtM(p.revenue)}</td>
                  <td className="py-2 px-2 sm:px-3 text-right font-mono">{formatRatio(p.revenue_growth)}</td>
                  <td className={`py-2 px-2 sm:px-3 text-right font-mono font-semibold ${
                    p.operating_margin >= 0 ? "text-success" : "text-danger"
                  }`}>
                    {formatRatio(p.operating_margin)}
                  </td>
                  <td className={`py-2 px-2 sm:px-3 text-right font-mono ${
                    p.operating_income >= 0 ? "" : "text-danger"
                  }`}>
                    {fmtM(p.operating_income)}
                  </td>
                  <td className={`py-2 px-2 sm:px-3 text-right font-mono ${
                    p.nopat >= 0 ? "" : "text-danger"
                  }`}>
                    {fmtM(p.nopat)}
                  </td>
                  <td className="py-2 px-2 sm:px-3 text-right font-mono text-muted-foreground">{fmtM(p.depreciation)}</td>
                  <td className="py-2 px-2 sm:px-3 text-right font-mono text-danger">({fmtM(p.capex)})</td>
                  <td className="py-2 px-2 sm:px-3 text-right font-mono text-muted-foreground">{fmtM(p.delta_nwc)}</td>
                  <td className={`py-2 px-2 sm:px-3 text-right font-mono font-semibold ${
                    p.fcff >= 0 ? "text-success" : "text-danger"
                  }`}>
                    {fmtM(p.fcff)}
                  </td>
                  <td className={`py-2 px-2 sm:px-3 text-right font-mono ${
                    p.pv_fcff >= 0 ? "" : "text-danger"
                  }`}>
                    {fmtM(p.pv_fcff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* EV Bridge: Terminal Value → Equity → Fair Price */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="val-card-title">Enterprise Value Bridge</h3>
        <div className="space-y-1">
          <BridgeRow label="Sum of PV(FCFF)" value={fmtM(pvFcffTotal)} muted />
          <BridgeRow
            label={`Terminal Value (Gordon Growth at ${formatRatio(terminalGrowthRate)})`}
            value={fmtM(terminalValue)}
            muted
          />
          <BridgeRow label="PV of Terminal Value" value={fmtM(pvTerminalValue)} muted />
          <BridgeRow label="Enterprise Value" value={fmtM(enterpriseValue)} accent />
          <BridgeRow label="(–) Net Debt" value={fmtM(netDebt)} muted />
          <BridgeRow label="Equity Value" value={fmtM(equityValue)} accent />
          <BridgeRow
            label={`(÷) Shares Outstanding`}
            value={formatMillions(sharesOutstanding)}
            muted
          />
          <BridgeRow
            label="Fair Value per Share"
            value={formatCurrency(model.fair_value)}
            primary
          />
        </div>

        {terminalValue === 0 && (
          <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            <strong>Note:</strong> Terminal value is $0 because Year 5 FCFF is negative.
            The company&apos;s operating margin convergence does not fully offset reinvestment
            needs within 5 years. See the sensitivity matrix for scenarios where the model
            produces a positive terminal value (higher target margin or lower WACC).
          </div>
        )}
      </Card>

      {/* Sensitivity Heatmap: WACC × Target Operating Margin */}
      {sensitivity && (
        <Card className="p-4 sm:p-6 space-y-4">
          <h3 className="val-card-title">
            Sensitivity Analysis — WACC × Target Operating Margin
          </h3>
          <SensitivityHeatmap
            waccValues={sensitivity.discount_rate_values}
            secondAxisValues={sensitivity.margin_values}
            prices={sensitivity.prices}
            currentPrice={currentPrice}
            xLabel="Target Op. Margin"
            isPercent={true}
          />
        </Card>
      )}

      {/* NWC % */}
      <Card className="p-4 sm:p-6 space-y-2">
        <h3 className="val-card-title">Working Capital Assumption</h3>
        <p className="text-sm text-muted-foreground">
          Net Working Capital is modeled at {formatRatio(nwcPct)} of revenue
          (historical average of receivables + inventory − payables). Changes in NWC
          (ΔNWC) are computed year-over-year and subtracted from free cash flow.
        </p>
      </Card>
    </div>
  );
}

// --- Helpers ---

function AssumptionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 rounded-lg border border-border/60 bg-muted/20">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold font-mono mt-1">{value}</div>
    </div>
  );
}

function BridgeRow({
  label,
  value,
  muted,
  accent,
  primary,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-primary/30">
        <span className="text-sm font-bold text-primary">{label}</span>
        <span className="text-xl font-bold font-mono text-primary">{value}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-between py-1.5 ${accent ? "border-t border-border/30 pt-2" : ""}`}>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "font-semibold"}`}>{label}</span>
      <span className={`font-mono text-sm ${muted ? "text-muted-foreground" : "font-semibold"}`}>{value}</span>
    </div>
  );
}
