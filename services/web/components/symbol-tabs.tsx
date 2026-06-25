"use client";

/**
 * Tab bar for the per-symbol detail page — delegates to the generic SectionTabs.
 * The bare /data/symbol/[symbol] route reports a null segment before its redirect
 * resolves → SectionTabs falls back to defaultSeg ("overall").
 */

import { useParams } from "next/navigation";
import { SectionTabs, type TabDef } from "@/components/section-tabs";

const TABS: TabDef[] = [
  { seg: "overall", label: "Overall" },
  { seg: "valuation", label: "Valuation" },
  { seg: "financials", label: "Financials" },
  { seg: "chart", label: "Chart" },
  { seg: "news", label: "News" },
  { seg: "events", label: "Events" },
  { seg: "analysts", label: "Analysts" },
  { seg: "ownership", label: "Ownership" },
  { seg: "options", label: "Options" },
];

export function SymbolTabs() {
  // Keep the URL's original casing in hrefs: changing the [symbol] segment case
  // (e.g. aapl→AAPL) makes Next treat it as a different route branch and unmounts
  // the shared layout, defeating cross-tab state preservation.
  const params = useParams<{ symbol: string }>();
  return <SectionTabs base={`/workspace/data/symbol/${params.symbol ?? ""}`} tabs={TABS} defaultSeg="overall" margin="12px 0 16px" />;
}
