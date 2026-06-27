"use client";

/**
 * Tab bar for a 13F legend's detail page — delegates to the generic SectionTabs.
 * Activity/Buys/Sells/History are placeholders for now (see /discover/legends/[cik]/*);
 * Holdings is the default tab.
 */

import { useParams } from "@/lib/next-navigation";
import { SectionTabs, type TabDef } from "@/components/section-tabs";

const TABS: TabDef[] = [
  { seg: "holdings", label: "Holdings" },
  { seg: "activity", label: "Activity" },
  { seg: "buys", label: "Buys" },
  { seg: "sells", label: "Sells" },
  { seg: "history", label: "History" },
];

export function LegendTabs() {
  const params = useParams<{ cik: string }>();
  return <SectionTabs base={`/workspace/discover/legends/${params.cik ?? ""}`} tabs={TABS} defaultSeg="holdings" margin="12px 0 16px" />;
}
