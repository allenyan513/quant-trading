"use client";

/**
 * Tab bar for the per-symbol detail page — delegates to the generic SectionTabs.
 * The bare /data/symbol/[symbol] route reports a null segment before its redirect
 * resolves → SectionTabs falls back to defaultSeg ("overall").
 */

import { useParams } from "next/navigation";
import { SectionTabs, type TabDef } from "@/components/section-tabs";

// Chart/Valuation/Financials lead; Overall (company profile) sits last. Options
// dropped (we don't trade — there's no options data).
const TABS: TabDef[] = [
  { seg: "chart", label: "Chart" },
  { seg: "valuation", label: "Valuation" },
  { seg: "financials", label: "Financials" },
  { seg: "analysts", label: "Analysts" },
  { seg: "ownership", label: "Ownership" },
  { seg: "events", label: "Events" },
  { seg: "news", label: "News" },
  { seg: "overall", label: "Overall" },
];

export function SymbolTabs() {
  // Keep the URL's original casing in hrefs: changing the [symbol] segment case
  // (e.g. aapl→AAPL) makes Next treat it as a different route branch and unmounts
  // the shared layout, defeating cross-tab state preservation.
  const params = useParams<{ symbol: string }>();
  return <SectionTabs base={`/workspace/data/symbol/${params.symbol ?? ""}`} tabs={TABS} defaultSeg="chart" margin="0 0 12px" />;
}
