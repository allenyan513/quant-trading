"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRatio } from "@/lib/format";
import type { EPVDetails } from "@/types";
import type { ValuationResult } from "@/types";

const TABS = [
  { id: "valuation", label: "Valuation" },
  { id: "revenue", label: "Revenue & Gross Profit" },
  { id: "ebit", label: "Normalized EBIT" },
  { id: "earnings", label: "Normalized Earning" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  details: EPVDetails;
  model: ValuationResult;
}

export function EPVBreakdown({ details: d, model }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("valuation");
  const histAsc = [...d.historical].reverse();

  return (
    <div className="val-card">
      {/* Tab Navigation — matches DCF pill style */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="overflow-x-auto">
        <div className="flex justify-end mb-2">
          <span className="text-xs text-muted-foreground">
            Currency: USD &nbsp; Millions
          </span>
        </div>

        {activeTab === "revenue" && <RevenueTab histAsc={histAsc} d={d} />}
        {activeTab === "ebit" && <EBITTab histAsc={histAsc} d={d} />}
        {activeTab === "earnings" && <EarningsTab histAsc={histAsc} d={d} />}
        {activeTab === "valuation" && <ValuationTab d={d} model={model} />}
      </div>
    </div>
  );
}

// --- Tab Components ---

function HistHeader({ histAsc, sustainableLabel = "Sustainable" }: { histAsc: { year: number }[]; sustainableLabel?: string }) {
  return (
    <thead>
      <tr className="border-b border-muted/30 text-muted-foreground">
        <th className="text-left py-2 font-medium min-w-[200px]" />
        <th className="text-right py-2 font-medium text-primary">{sustainableLabel}</th>
        {histAsc.map((h) => (
          <th key={h.year} className="text-right py-2 font-medium">{h.year}</th>
        ))}
      </tr>
    </thead>
  );
}

function RevenueTab({ histAsc, d }: { histAsc: EPVDetails["historical"]; d: EPVDetails }) {
  return (
    <table className="w-full text-sm">
      <HistHeader histAsc={histAsc} />
      <tbody>
        <DataRow label="Revenue" values={histAsc.map((h) => fmtM(h.revenue))} />
        <DataRow label="Sustainable revenue" sustainable={fmtM(d.sustainable_revenue)} cols={histAsc.length} primary />
        <DataRow label="Gross margin" values={histAsc.map((h) => pct(h.gross_margin))} italic />
        <DataRow label="Sustainable gross margin" sustainable={pct(d.sustainable_gross_margin)} cols={histAsc.length} bold />
        <DataRow label="Sustainable gross profit" sustainable={fmtM(d.sustainable_gross_profit)} cols={histAsc.length} primary summary />
      </tbody>
    </table>
  );
}

function EBITTab({ histAsc, d }: { histAsc: EPVDetails["historical"]; d: EPVDetails }) {
  return (
    <table className="w-full text-sm">
      <HistHeader histAsc={histAsc} sustainableLabel="Normalized" />
      <tbody>
        <DataRow label="Sustainable gross profit" sustainable={fmtM(d.sustainable_gross_profit)} cols={histAsc.length} primary />
        <DataRow label="Research & Development" values={histAsc.map((h) => fmtM(h.rnd))} />
        <DataRow label="Selling, G&A expense" values={histAsc.map((h) => fmtM(h.sga))} />
        <DataRow label="Total operating expenses" values={histAsc.map((h) => fmtM(h.total_opex))} bold />
        <DataRow label="% of Revenue" values={histAsc.map((h) => pct(h.opex_pct))} italic />
        <DataRow label="(-) Maintenance operating expenses" sustainable={fmtM(d.maintenance_opex)} cols={histAsc.length} />
        <DataRow label="Normalized EBIT" sustainable={fmtM(d.normalized_ebit)} cols={histAsc.length} bold />
        <DataRow label="Tax rate" values={histAsc.map((h) => pct(h.tax_rate))} />
        <DataRow label={`${d.historical.length}Y Average`} sustainable={pct(d.avg_tax_rate)} cols={histAsc.length} />
        <DataRow label="After-tax Normalized EBIT" sustainable={fmtM(d.after_tax_normalized_ebit)} cols={histAsc.length} primary summary />
      </tbody>
    </table>
  );
}

function EarningsTab({ histAsc, d }: { histAsc: EPVDetails["historical"]; d: EPVDetails }) {
  return (
    <table className="w-full text-sm">
      <HistHeader histAsc={histAsc} sustainableLabel="Normalized" />
      <tbody>
        <DataRow label="After-tax Normalized EBIT" sustainable={fmtM(d.after_tax_normalized_ebit)} cols={histAsc.length} primary />
        <DataRow label="Capex" values={histAsc.map((h) => fmtM(h.capex))} />
        <DataRow label="Depreciation & Amortization" values={histAsc.map((h) => fmtM(h.da))} />
        <tr className="border-b border-muted/30">
          <td className="py-2 font-medium">Difference</td>
          <td className="py-2 text-right" />
          {histAsc.map((h) => (
            <td key={h.year} className={cn("py-2 text-right font-mono font-medium", h.capex_minus_da > 0 ? "text-danger" : "text-success")}>
              {fmtM(h.capex_minus_da)}
            </td>
          ))}
        </tr>
        <DataRow label={`(-) ${d.historical.length}Y Average Difference`} sustainable={fmtM(Math.max(0, d.avg_capex_minus_da))} cols={histAsc.length} />
        <DataRow label="Normalized Earnings" sustainable={fmtM(d.normalized_earnings)} cols={histAsc.length} primary summary />
      </tbody>
    </table>
  );
}

function ValuationTab({ d, model }: { d: EPVDetails; model: ValuationResult }) {
  const sel = "py-2 text-right font-mono bg-muted/30";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-muted/30 text-muted-foreground">
          <th className="text-left py-2 font-medium" />
          <th className="text-right py-2 font-medium w-[18%]">Low</th>
          <th className="text-right py-2 font-medium text-primary w-[18%]">Selected</th>
          <th className="text-right py-2 font-medium w-[18%]">High</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-muted/30">
          <td className="py-2">Normalized Earnings</td>
          <td className="py-2 text-right font-mono">{fmtM(d.normalized_earnings)}</td>
          <td className={sel}>{fmtM(d.normalized_earnings)}</td>
          <td className="py-2 text-right font-mono">{fmtM(d.normalized_earnings)}</td>
        </tr>
        <tr className="border-b border-muted/30">
          <td className="py-2">(/) WACC</td>
          <td className="py-2 text-right font-mono">{pct(d.wacc_high)}</td>
          <td className={cn(sel, "font-semibold text-primary")}>{pct(d.wacc)}</td>
          <td className="py-2 text-right font-mono">{pct(d.wacc_low)}</td>
        </tr>
        <tr className="border-b border-muted/30">
          <td className="py-2 font-medium text-primary">Enterprise Value</td>
          <td className="py-2 text-right font-mono text-primary font-semibold">{fmtM(d.enterprise_value_low)}</td>
          <td className={cn(sel, "font-bold text-primary")}>{fmtM(d.enterprise_value)}</td>
          <td className="py-2 text-right font-mono text-primary font-semibold">{fmtM(d.enterprise_value_high)}</td>
        </tr>
        <tr className="border-b border-muted/30">
          <td className="py-2">(-) Net debt</td>
          <td className="py-2 text-right font-mono">{fmtM(d.net_debt)}</td>
          <td className={sel}>{fmtM(d.net_debt)}</td>
          <td className="py-2 text-right font-mono">{fmtM(d.net_debt)}</td>
        </tr>
        <tr className="border-b border-muted/30">
          <td className="py-2 font-medium text-primary">Equity Value</td>
          <td className="py-2 text-right font-mono text-primary font-semibold">{fmtM(d.equity_value_low)}</td>
          <td className={cn(sel, "font-bold text-primary")}>{fmtM(d.equity_value)}</td>
          <td className="py-2 text-right font-mono text-primary font-semibold">{fmtM(d.equity_value_high)}</td>
        </tr>
        <tr className="border-b border-muted/30">
          <td className="py-2">(/) Outstanding shares</td>
          <td className="py-2 text-right font-mono">{fmtM(d.shares_outstanding)}</td>
          <td className={sel}>{fmtM(d.shares_outstanding)}</td>
          <td className="py-2 text-right font-mono">{fmtM(d.shares_outstanding)}</td>
        </tr>
        <tr className="border-t-2 border-primary/40">
          <td className="py-2 font-semibold text-primary">Fair Price</td>
          <td className="py-2 text-right font-mono font-bold text-primary">{formatCurrency(model.low_estimate)}</td>
          <td className={cn(sel, "font-bold text-primary text-lg")}>{formatCurrency(model.fair_value)}</td>
          <td className="py-2 text-right font-mono font-bold text-primary">{formatCurrency(model.high_estimate)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// --- Shared helpers ---

function fmtM(val: number): string {
  const millions = Math.round(val / 1e6);
  return millions.toLocaleString("en-US");
}

function pct(val: number): string {
  return formatRatio(val);
}

function DataRow({
  label,
  values,
  sustainable,
  cols,
  primary,
  bold,
  italic,
  summary,
}: {
  label: string;
  values?: string[];
  sustainable?: string;
  cols?: number;
  primary?: boolean;
  bold?: boolean;
  italic?: boolean;
  summary?: boolean;
}) {
  return (
    <tr className={summary ? "border-t-2 border-primary/40" : "border-b border-muted/30"}>
      <td className={cn(
        "py-2",
        (primary || summary) && "font-semibold text-primary",
        bold && !primary && "font-medium",
        italic && "italic text-primary",
      )}>
        {label}
      </td>
      {sustainable !== undefined ? (
        <>
          <td className={cn(
            "py-2 text-right font-mono",
            (primary || summary) && "text-primary font-semibold",
            summary && "font-bold",
          )}>
            {sustainable}
          </td>
          {Array.from({ length: cols ?? 0 }).map((_, i) => (
            <td key={i} className="py-2 text-right" />
          ))}
        </>
      ) : (
        <>
          <td className="py-2 text-right" />
          {values?.map((v, i) => (
            <td key={i} className={cn(
              "py-2 text-right font-mono",
              bold && "font-medium",
              italic && "text-primary italic",
            )}>
              {v}
            </td>
          ))}
        </>
      )}
    </tr>
  );
}
