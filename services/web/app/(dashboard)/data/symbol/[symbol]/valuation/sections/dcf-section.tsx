"use client";

import { useState } from "react";
import { DCFFCFFCards } from "@/components/valuation/dcf-fcff-cards";
import { DCFFCFFEBITDAExitCards } from "@/components/valuation/dcf-fcff-ebitda-exit-cards";
import { RevenueDCFCards } from "@/components/valuation/revenue-dcf-cards";
import { generateDCFNarrative } from "@qt/shared/valuation-narrative";
import { cn } from "@/lib/utils";
import type { ValuationSummary, ValuationModelType, ValuationResult } from "@/types";

// --- Tab configs per tier ---

const FULL_TIER_TABS: { modelType: ValuationModelType; label: string }[] = [
  { modelType: "dcf_fcff_growth_5y", label: "Growth Exit 5Y" },
  { modelType: "dcf_fcff_growth_10y", label: "Growth Exit 10Y" },
  { modelType: "dcf_fcff_ebitda_exit_5y", label: "EBITDA Exit 5Y" },
  { modelType: "dcf_fcff_ebitda_exit_10y", label: "EBITDA Exit 10Y" },
];

const PRE_PROFIT_TABS: { modelType: ValuationModelType; label: string }[] = [
  { modelType: "revenue_dcf_10y", label: "Revenue DCF 10Y" },
  { modelType: "revenue_dcf_5y", label: "Revenue DCF 5Y" },
];

interface Props {
  summary: ValuationSummary;
  isPreProfit: boolean;
}

export function DCFSection({ summary, isPreProfit }: Props) {
  const tabs = isPreProfit ? PRE_PROFIT_TABS : FULL_TIER_TABS;
  const [activeTab, setActiveTab] = useState(0);

  // Filter to tabs that have valid models
  const availableTabs = tabs.filter((tab) => {
    const model = summary.models.find((m) => m.model_type === tab.modelType);
    return model && model.fair_value > 0;
  });

  if (availableTabs.length === 0) return null;

  return (
    <section id="dcf">
      <h2 className="val-h2">DCF Analysis</h2>

      {/* Tab bar */}
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

      {/* Tab panels — all rendered in DOM, hidden attribute for inactive */}
      {availableTabs.map((tab, i) => {
        const model = summary.models.find((m) => m.model_type === tab.modelType)!;
        return (
          <div key={tab.modelType} hidden={activeTab !== i}>
            <DCFPanel
              model={model}
              modelType={tab.modelType}
              summary={summary}
            />
          </div>
        );
      })}

    </section>
  );
}

function DCFPanel({
  model,
  modelType,
  summary,
}: {
  model: ValuationResult;
  modelType: ValuationModelType;
  summary: ValuationSummary;
}) {
  // Revenue DCF
  if (modelType === "revenue_dcf_5y" || modelType === "revenue_dcf_10y") {
    return (
      <RevenueDCFCards
        model={model}
        currentPrice={summary.current_price}
        companyName={summary.company_name}
        ticker={summary.ticker}
      />
    );
  }

  const narrative = generateDCFNarrative(
    model,
    summary.company_name,
    summary.ticker,
    summary.current_price,
  );

  // EBITDA Exit
  if (modelType === "dcf_fcff_ebitda_exit_5y" || modelType === "dcf_fcff_ebitda_exit_10y") {
    return (
      <DCFFCFFEBITDAExitCards
        model={model}
        currentPrice={summary.current_price}
        narrative={narrative}
        peers={[]}
      />
    );
  }

  // Growth Exit (default)
  return (
    <DCFFCFFCards
      model={model}
      currentPrice={summary.current_price}
      narrative={narrative}
    />
  );
}
