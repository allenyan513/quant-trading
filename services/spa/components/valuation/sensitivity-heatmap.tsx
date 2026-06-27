"use client";

import { formatRatio } from "@/lib/format";

interface Props {
  waccValues: number[];
  secondAxisValues: number[];
  prices: number[][];
  currentPrice: number;
  xLabel: string; // "Terminal Growth Rate" or "Exit Multiple"
  isPercent?: boolean; // true for growth rate, false for multiples
}

export function SensitivityHeatmap({
  waccValues,
  secondAxisValues,
  prices,
  currentPrice,
  xLabel,
  isPercent = true,
}: Props) {
  function getCellColor(price: number): string {
    const ratio = price / currentPrice;
    if (ratio > 1.3) return "bg-green-900/40 text-green-300";
    if (ratio > 1.1) return "bg-green-900/20 text-green-400";
    if (ratio > 0.9) return "bg-muted text-muted-foreground";
    if (ratio > 0.7) return "bg-red-900/20 text-red-400";
    return "bg-red-900/40 text-red-300";
  }

  function formatValue(v: number, percent: boolean): string {
    return percent ? formatRatio(v) : `${v.toFixed(1)}x`;
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <table className="w-full text-[10px] sm:text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 sm:p-2 border text-left text-muted-foreground">
              WACC \ {xLabel}
            </th>
            {secondAxisValues.map((v) => (
              <th key={v} className="p-1.5 sm:p-2 border text-center font-medium">
                {formatValue(v, isPercent)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {waccValues.map((wacc, wi) => (
            <tr key={wacc}>
              <td className="p-1.5 sm:p-2 border font-medium">
                {formatRatio(wacc)}
              </td>
              {prices[wi].map((price, gi) => (
                <td
                  key={gi}
                  className={`p-2 border text-center font-mono ${getCellColor(price)}`}
                >
                  ${price.toFixed(0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Current price: ${currentPrice.toFixed(2)}. Green = undervalued, Red = overvalued.
      </p>
    </div>
  );
}
