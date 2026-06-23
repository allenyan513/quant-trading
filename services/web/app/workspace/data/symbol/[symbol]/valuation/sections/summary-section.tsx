import { SummaryCard } from "@/components/valuation/summary-card";
import { formatTimestamp } from "@/lib/format";
import type { ValuationSummary } from "@/types";

interface Props {
  summary: ValuationSummary;
  computedAt: string;
}

export function SummarySection({ summary, computedAt }: Props) {
  return (
    <section id="summary">
      <SummaryCard summary={summary} updatedAt={formatTimestamp(computedAt)} />
    </section>
  );
}
