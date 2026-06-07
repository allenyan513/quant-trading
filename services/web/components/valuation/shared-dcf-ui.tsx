"use client";

import type React from "react";

/**
 * Stepper input for DCF model parameters (WACC, growth rate, multiples).
 * Shared across dcf-cards, dcf-fcff-cards, and dcf-fcff-ebitda-exit-cards.
 */
export function ParamInput({
  label, value, onChange, min, max, step, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="text-center p-4 rounded-xl border border-border/60 bg-muted/30">
      <div className="text-sm text-muted-foreground mb-2">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => onChange(clamp(value - step))}
          className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          aria-label={`Decrease ${label}`}>−</button>
        <span className="text-xl font-bold font-mono min-w-[5rem]">
          {value.toFixed(step < 1 ? 2 : 1)}{suffix}
        </span>
        <button onClick={() => onChange(clamp(value + step))}
          className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          aria-label={`Increase ${label}`}>+</button>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5">{min}{suffix} – {max}{suffix}</div>
    </div>
  );
}

/** Highlight dollar values, percentages, multiples, and verdicts in narrative text. */
export function highlightNarrative(text: string): React.ReactNode[] {
  const pattern = /(\$[\d,.]+[TB]?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?x|undervalued|overvalued|fairly valued)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const value = match[0];
    const isVerdict = value === "undervalued" || value === "overvalued" || value === "fairly valued";
    parts.push(
      <span key={match.index} className={isVerdict ? "font-semibold text-foreground" : "font-semibold text-foreground tabular-nums"}>
        {value}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
