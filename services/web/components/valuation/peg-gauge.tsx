"use client";

import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/format";

interface PEGGaugeProps {
  peg: number | null;
  currentPE: number | null;
  adjustedGrowth: number; // decimal, e.g., 0.128 for 12.8%
  dividendYield: number; // decimal
  rawGrowth: number; // unclamped decimal, for classification
}

/** PEG stock categories — most useful for Stalwarts and Fast Growers */
type PEGCategory = {
  label: string;
  applicability: "high" | "medium" | "low";
  note: string;
};

function classifyByGrowth(rawGrowth: number): PEGCategory {
  const g = rawGrowth * 100;
  if (g < 0) return { label: "Turnaround", applicability: "low", note: "PEG is unreliable for companies with declining earnings." };
  if (g < 8) return { label: "Slow Grower", applicability: "low", note: "PEG tends to undervalue slow growers — consider dividend yield and asset value instead." };
  if (g < 15) return { label: "Stalwart", applicability: "high", note: "PEG works well for steady growers with predictable earnings." };
  if (g <= 25) return { label: "Fast Grower", applicability: "high", note: "PEG is most informative for high-growth companies — the PEG sweet spot." };
  return { label: "Fast Grower", applicability: "medium", note: "Growth above 25% is capped — hypergrowth may not be sustainable long-term." };
}

const ZONES = [
  { max: 0.75, label: "Deep Value", color: "text-green-400", bg: "bg-green-400" },
  { max: 1.0, label: "Undervalued", color: "text-green-400", bg: "bg-green-400" },
  { max: 1.5, label: "Fair Value", color: "text-yellow-400", bg: "bg-yellow-400" },
  { max: 2.0, label: "Pricey", color: "text-orange-400", bg: "bg-orange-400" },
  { max: Infinity, label: "Expensive", color: "text-red-400", bg: "bg-red-400" },
] as const;

function getZone(peg: number) {
  return ZONES.find((z) => peg <= z.max) ?? ZONES[ZONES.length - 1];
}

/** Clamp PEG to 0–3 range for display, return percentage position */
function pegToPercent(peg: number): number {
  const clamped = Math.max(0, Math.min(3, peg));
  return (clamped / 3) * 100;
}

export function PEGGauge({ peg, currentPE, adjustedGrowth, dividendYield, rawGrowth }: PEGGaugeProps) {
  const category = classifyByGrowth(rawGrowth);
  if (peg === null || currentPE === null) {
    return (
      <div className="rounded-md border bg-muted/30 p-5 text-center text-muted-foreground text-sm">
        PEG ratio unavailable — requires positive earnings and growth data.
      </div>
    );
  }

  const zone = getZone(peg);
  const position = pegToPercent(peg);
  const epsGrowthPct = formatRatio(rawGrowth);
  const divPct = formatRatio(dividendYield);
  const totalPct = formatRatio(adjustedGrowth);

  return (
    <div className="space-y-4">
      {/* PEG Value + Zone Label */}
      <div className="flex items-baseline gap-3">
        <span className={cn("text-3xl font-bold font-mono", zone.color)}>
          {peg.toFixed(2)}
        </span>
        <span className={cn("text-sm font-medium", zone.color)}>
          {zone.label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative">
        {/* Track */}
        <div className="h-3 rounded-full overflow-hidden flex">
          <div className="flex-1 bg-green-500/30" /> {/* 0–1 */}
          <div className="flex-1 bg-yellow-500/30" /> {/* 1–2 */}
          <div className="flex-1 bg-red-500/30" /> {/* 2–3 */}
        </div>

        {/* Pointer */}
        <div
          className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${position}%` }}
        >
          <div className={cn("w-3 h-3 rounded-full border-2 border-background", zone.bg)} />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground font-mono">
          <span>0</span>
          <span>1.0</span>
          <span>2.0</span>
          <span>3.0+</span>
        </div>
      </div>

      {/* Formula breakdown */}
      <div className="text-sm text-muted-foreground font-mono">
        <span>PEG = P/E ÷ {dividendYield > 0 ? "(Growth + Yield)" : "Growth"} = </span>
        <span className="text-foreground">{currentPE.toFixed(1)}</span>
        <span> ÷ </span>
        <span className="text-foreground">{dividendYield > 0 ? `(${epsGrowthPct} + ${divPct})` : totalPct}</span>
        <span> = </span>
        <span className={cn("font-bold", zone.color)}>{peg.toFixed(2)}</span>
      </div>

      {/* PEG rule of thumb */}
      <p className="text-xs text-muted-foreground">
        PEG &lt; 1 = bargain, 1–1.5 = fair, &gt; 2 = expensive.
      </p>

      {/* Growth classification + applicability */}
      <div className={cn(
        "rounded-md border px-4 py-3 text-xs",
        category.applicability === "high" ? "border-green-500/30 bg-green-500/5" :
        category.applicability === "medium" ? "border-yellow-500/30 bg-yellow-500/5" :
        "border-orange-500/30 bg-orange-500/5",
      )}>
        <span className="font-medium text-foreground">
          Growth Category: {category.label}
        </span>
        <span className={cn(
          "ml-2",
          category.applicability === "high" ? "text-green-400" :
          category.applicability === "medium" ? "text-yellow-400" :
          "text-orange-400",
        )}>
          {category.applicability === "high" ? "PEG highly applicable" :
           category.applicability === "medium" ? "PEG moderately applicable" :
           "PEG less reliable"}
        </span>
        <p className="text-muted-foreground mt-1">{category.note}</p>
      </div>
    </div>
  );
}
