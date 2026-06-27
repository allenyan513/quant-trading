"use client";

import { useState } from "react";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { cn } from "@/lib/utils";
import { formatLargeNumber, formatRatio } from "@/lib/format";
import type {
  ValuationSummary,
  ValuationModelType,
  ValuationResult,
  PeerComparison,
  TradingMultiplesResult,
} from "@/types";

// --- Tab configs ---
// Adapted from value-scope's MultiplesSection: instead of the separate
// RelativePageData pipeline, we read the trading-/revenue-multiples models
// straight out of the ValuationSummary `detail` we persist server-side. Each
// model already carries its peer set + industry median in `details`.

const FULL_TIER_TABS: { modelType: ValuationModelType; label: string }[] = [
  { modelType: "pe_multiples", label: "P/E" },
  { modelType: "ev_ebitda_multiples", label: "EV/EBITDA" },
  { modelType: "ev_revenue_multiples", label: "EV/Revenue" },
];

const PRE_PROFIT_TABS: { modelType: ValuationModelType; label: string }[] = [
  { modelType: "ev_revenue_multiples", label: "EV/Revenue" },
];

interface Props {
  summary: ValuationSummary;
  isPreProfit: boolean;
}

export function MultiplesSection({ summary, isPreProfit }: Props) {
  const tabs = isPreProfit ? PRE_PROFIT_TABS : FULL_TIER_TABS;
  const [activeTab, setActiveTab] = useState(0);

  const availableTabs = tabs.filter((tab) => {
    const model = summary.models.find((m) => m.model_type === tab.modelType);
    return model && model.fair_value > 0;
  });

  if (availableTabs.length === 0) return null;

  return (
    <section id="trading-multiples">
      <h2 className="val-h2">Trading Multiples</h2>

      {availableTabs.length > 1 && (
        <div className="flex gap-1 border-b border-muted/40 mb-6 overflow-x-auto">
          {availableTabs.map((tab, i) => (
            <button
              key={tab.modelType}
              onClick={() => setActiveTab(i)}
              className={cn(
                "px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === i
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {availableTabs.map((tab, i) => {
        const model = summary.models.find((m) => m.model_type === tab.modelType)!;
        return (
          <div key={tab.modelType} hidden={activeTab !== i}>
            <MultiplePanel model={model} currentPrice={summary.current_price} />
          </div>
        );
      })}
    </section>
  );
}

function MultiplePanel({ model, currentPrice }: { model: ValuationResult; currentPrice: number }) {
  const d = model.details as unknown as TradingMultiplesResult["details"];
  const peers: PeerComparison[] = Array.isArray(d?.peers) ? d.peers : [];

  return (
    <>
      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={currentPrice}
        upside={model.upside_percent}
        narrative={
          <>
            Applying the peer-group {d?.metric_label ?? "multiple"} (industry median{" "}
            <strong className="text-foreground">
              {d?.industry_median != null ? d.industry_median.toFixed(1) : "—"}x
            </strong>
            {d?.company_metric != null && (
              <> on company {d.metric_label ?? "metric"} of {formatLargeNumber(d.company_metric)}</>
            )}
            ) implies a fair value of <strong className="text-foreground">{`$${model.fair_value.toFixed(2)}`}</strong> per share.
          </>
        }
      />

      {peers.length > 0 && (
        <div className="val-card">
          <h3 className="val-card-title">Peer Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Ticker</th>
                  <th className="text-right py-2 px-3">Mkt Cap ($M)</th>
                  <th className="text-right py-2 px-3">Trailing P/E</th>
                  <th className="text-right py-2 px-3">Fwd P/E</th>
                  <th className="text-right py-2 px-3">EV/EBITDA</th>
                  <th className="text-right py-2 px-3">EV/Rev</th>
                  <th className="text-right py-2 px-3">Rev Growth</th>
                  <th className="text-right py-2 pl-3">Net Margin</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => (
                  <tr key={p.ticker} className="border-b border-muted/20">
                    <td className="py-2 pr-4 font-medium">
                      {p.ticker}
                      <span className="text-muted-foreground font-normal"> · {p.name}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{formatLargeNumber(p.market_cap, { prefix: "" })}</td>
                    <td className="py-2 px-3 text-right font-mono">{ratio(p.trailing_pe)}</td>
                    <td className="py-2 px-3 text-right font-mono">{ratio(p.forward_pe)}</td>
                    <td className="py-2 px-3 text-right font-mono">{ratio(p.ev_ebitda)}</td>
                    <td className="py-2 px-3 text-right font-mono">{ratio(p.ev_revenue)}</td>
                    <td className="py-2 px-3 text-right font-mono">{pct(p.revenue_growth)}</td>
                    <td className="py-2 pl-3 text-right font-mono">{pct(p.net_margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ratio(v: number | null): string {
  return v != null ? `${v.toFixed(1)}x` : "—";
}

function pct(v: number | null): string {
  return v != null ? formatRatio(v) : "—";
}
