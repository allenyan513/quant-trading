"use client";

import { useState, useMemo } from "react";
import type { ValuationResult, DCFFCFFProjectionYear } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";
import { ValuationHero } from "./valuation-hero";
import { ParamInput, highlightNarrative } from "./shared-dcf-ui";
import { formatMillions, formatRatio, getUpsideColor } from "@/lib/format";

// --- Tab definitions ---
const FCFF_TABS = [
  { id: "fcf", label: "Terminal Value" },
  { id: "revenue", label: "Revenue & Expenses" },
  { id: "capex-da", label: "CapEx & D&A" },
  { id: "working-capital", label: "Working Capital" },
] as const;

type TabId = (typeof FCFF_TABS)[number]["id"];

// --- Component ---

interface Props {
  model: ValuationResult;
  currentPrice: number;
  narrative?: string;
}

export function DCFFCFFCards({ model, currentPrice, narrative }: Props) {
  const details = model.details as Record<string, unknown>;
  const assumptions = model.assumptions as Record<string, unknown>;

  const projections = details.projections as DCFFCFFProjectionYear[];
  const terminalYear = details.terminal_year as DCFFCFFProjectionYear;
  const sharesOut = details.shares_outstanding as number;
  const netDebt = details.net_debt as number;

  const daSchedule = details.da_schedule as {
    useful_life: number;
    vintages: { capex_year: number; amounts: number[] }[];
    totals: number[];
  };
  const wc = details.working_capital as {
    dso: number; dpo: number; dio: number;
    years: number[]; receivables: number[]; payables: number[];
    inventory: number[]; nwc: number[]; delta_nwc: number[];
  };
  const expenseRatios = details.expense_ratios as {
    cogs_pct: number; sga_pct: number; rnd_pct: number;
    interest_pct: number; tax_rate: number;
  };
  const baseYear = details.base_year as {
    year: number; revenue: number; cogs: number; sga: number;
    rnd: number; interest_expense: number; tax: number;
    net_income: number; nwc: number;
  };

  // Raw precision values for accurate recalculation; fall back to rounded assumptions
  const waccRaw = details.wacc_raw as number | undefined;
  const termGrowthRaw = details.terminal_growth_raw as number | undefined;
  const projectionYears = (details.projection_years as number | undefined) ?? 5;

  // Server defaults (percentage form for sliders)
  const defaultWACC = waccRaw != null
    ? Math.round(waccRaw * 10000) / 100
    : (assumptions.wacc as number);
  const defaultTerminalGrowth = termGrowthRaw != null
    ? Math.round(termGrowthRaw * 10000) / 100
    : (assumptions.terminal_growth_rate as number);

  // Interactive state
  const [wacc, setWACC] = useState(defaultWACC);
  const [terminalGrowth, setTerminalGrowth] = useState(defaultTerminalGrowth);
  const [activeTab, setActiveTab] = useState<TabId>("fcf");

  const isCustom = wacc !== defaultWACC || terminalGrowth !== defaultTerminalGrowth;

  const resetDefaults = () => {
    setWACC(defaultWACC);
    setTerminalGrowth(defaultTerminalGrowth);
  };

  // Recalculate when parameters change
  const calc = useMemo(() => {
    // Use raw precision when at defaults to match server fair_value exactly
    const w = !isCustom && waccRaw != null ? waccRaw : wacc / 100;
    const g = !isCustom && termGrowthRaw != null ? termGrowthRaw : terminalGrowth / 100;

    // PV of projected FCFFs (mid-year)
    const rows = projections.map((p) => {
      const df = 1 / Math.pow(1 + w, p.timing);
      return { ...p, discount_factor: df, pv_fcff: p.fcff * df };
    });

    const pvFCFFTotal = rows.reduce((sum, p) => sum + p.pv_fcff, 0);

    // Terminal value
    const termFCFF = terminalYear.fcff;
    const tv = w > g ? termFCFF / (w - g) : termFCFF * 20;
    const pvTV = tv / Math.pow(1 + w, projectionYears);

    const ev = pvFCFFTotal + pvTV;
    const equity = ev - netDebt;
    const fairValue = Math.max(0, equity / sharesOut);
    const upsidePercent = ((fairValue - currentPrice) / currentPrice) * 100;

    const wLeG = w <= g;

    return { rows, pvFCFFTotal, tv, pvTV, ev, equity, fairValue, upsidePercent, wLeG };
  }, [wacc, terminalGrowth, projections, terminalYear, netDebt, sharesOut, currentPrice, projectionYears, isCustom, waccRaw, termGrowthRaw]);

  // Sensitivity matrix
  const sm = details.sensitivity_matrix as Record<string, unknown>;
  const discountRateValues = sm.discount_rate_values as number[];
  const growthValues = sm.growth_values as number[];
  const prices = sm.prices as number[][];

  const projYears = projections.length;
  const colSpan = projYears + 2; // projections + terminal + label

  return (
    <div className="space-y-6">
      {/* ===== Card 1: ValuationHero ===== */}
      <ValuationHero
        fairValue={calc.fairValue}
        currentPrice={currentPrice}
        upside={calc.upsidePercent}
        customLabel={isCustom ? <span className="text-amber-400 normal-case ml-1">(custom)</span> : undefined}
        narrative={narrative ? highlightNarrative(narrative) : undefined}
      />

      {/* ===== Card 2: FCFF Present Value Calculation ===== */}
      <div className="val-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="val-card-title">FCFF Present Value Calculation</h3>
            {isCustom && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Modified</span>
            )}
          </div>
          {isCustom && (
            <button onClick={resetDefaults}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              Reset to Default
            </button>
          )}
        </div>

        {/* Interactive Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
          <ParamInput label="WACC" value={wacc} onChange={setWACC} min={3} max={20} step={0.25} suffix="%" />
          <ParamInput label="Terminal Growth" value={terminalGrowth} onChange={setTerminalGrowth} min={0} max={6} step={0.25} suffix="%" />
          <div className="text-center p-4 rounded-xl border border-border/60 bg-muted/30">
            <div className="text-sm text-muted-foreground mb-2">Forecast Period</div>
            <div className="text-xl font-bold font-mono">5 Yrs</div>
            <div className="text-[11px] text-muted-foreground mt-1.5">+ Terminal Year</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4 text-center">
          Adjust parameters to explore scenarios. Changes are for exploration only and do not affect saved valuations.
        </p>

        {calc.wLeG && (
          <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-800 text-sm text-amber-300">
            WACC must be greater than terminal growth for a meaningful terminal value. Using fallback multiplier.
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 mb-4">
          {FCFF_TABS.map((tab) => (
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
            <span className="text-xs text-muted-foreground">Currency: USD &nbsp; Millions</span>
          </div>

          {activeTab === "fcf" && <FCFSummaryTab rows={calc.rows} terminalYear={terminalYear} wacc={wacc} terminalGrowth={terminalGrowth} pvTerminal={calc.pvTV} tv={calc.tv} ev={calc.ev} pvFCFFTotal={calc.pvFCFFTotal} netDebt={netDebt} equity={calc.equity} sharesOut={sharesOut} fairValue={calc.fairValue} upsidePercent={calc.upsidePercent} />}
          {activeTab === "revenue" && <RevenueTab rows={calc.rows} baseYear={baseYear} ratios={expenseRatios} />}
          {activeTab === "capex-da" && <CapExDATab rows={calc.rows} daSchedule={daSchedule} />}
          {activeTab === "working-capital" && <WorkingCapitalTab wc={wc} baseYear={baseYear} />}
        </div>

      </div>

      {/* ===== Card 3: Sensitivity Analysis ===== */}
      <div className="val-card">
        <h3 className="val-card-title">Sensitivity Analysis</h3>
        <SensitivityHeatmap
          waccValues={discountRateValues}
          secondAxisValues={growthValues}
          prices={prices}
          currentPrice={currentPrice}
          xLabel="Terminal Growth Rate"
          isPercent={true}
        />
      </div>
    </div>
  );
}

// ============================================================
// Tab Components
// ============================================================

function FCFSummaryTab({
  rows, terminalYear, wacc, terminalGrowth, pvTerminal, tv,
  ev, pvFCFFTotal, netDebt, equity, sharesOut, fairValue, upsidePercent,
}: {
  rows: (DCFFCFFProjectionYear & { pv_fcff: number })[];
  terminalYear: DCFFCFFProjectionYear;
  wacc: number;
  terminalGrowth: number;
  pvTerminal: number;
  tv: number;
  ev: number;
  pvFCFFTotal: number;
  netDebt: number;
  equity: number;
  sharesOut: number;
  fairValue: number;
  upsidePercent: number;
}) {
  const colSpan = rows.length + 2;
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold text-sm"></th>
          {rows.map((p) => (
            <th key={p.year} className="text-right p-2.5 font-semibold text-sm">{p.year}</th>
          ))}
          <th className="text-right p-2.5 font-semibold text-sm bg-sky-950/20">
            <div>Terminal</div>
          </th>
        </tr>
      </thead>
      <tbody>
        {/* === EBITDA Build === */}
        <Row label="Profit Before Tax" values={rows.map(p => p.income_before_tax)} terminal={terminalYear.income_before_tax} />
        <Row label="(−) Net Interest" values={rows.map(p => p.interest_expense)} terminal={terminalYear.interest_expense} muted />
        <Row label="(+) D&A" values={rows.map(p => p.depreciation)} terminal={terminalYear.depreciation} muted />
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">EBITDA</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.ebitda)}</td>)}
          <td className="p-2.5 text-right font-mono font-bold text-orange-400 bg-sky-950/10">{formatMillions(terminalYear.ebitda)}</td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        {/* === FCFF === */}
        <Row label="(−) Tax" values={rows.map(p => p.tax)} terminal={terminalYear.tax} muted />
        <Row label="(−) CapEx" values={rows.map(p => p.capex)} terminal={terminalYear.capex} muted />
        <Row label="(−) ΔWC" values={rows.map(p => p.delta_nwc)} terminal={terminalYear.delta_nwc} muted />
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Free Cash Flow (FCFF)</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.fcff)}</td>)}
          <td className="p-2.5 text-right font-mono font-bold text-orange-400 bg-sky-950/10">{formatMillions(terminalYear.fcff)}</td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        {/* === Terminal Value === */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-semibold text-orange-400">Terminal Value</td>
          {rows.map((p) => <td key={p.year} className="p-2.5"></td>)}
          <td className="p-2.5 text-right font-mono font-semibold text-orange-400 bg-sky-950/10">{formatMillions(tv)}</td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium text-muted-foreground">WACC / Discount Rate</td>
          <td className="p-2.5 text-right font-mono font-semibold">{wacc.toFixed(1)}%</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium text-muted-foreground">Long-term Growth Rate</td>
          <td className="p-2.5 text-right font-mono font-semibold">{terminalGrowth.toFixed(1)}%</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        {/* === Discounting === */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium text-muted-foreground">Timing of FCF (mid year)</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{p.timing.toFixed(1)}</td>)}
          <td className="p-2.5 text-right font-mono text-muted-foreground bg-sky-950/10">5</td>
        </tr>
        <tr className="border-b bg-primary/5">
          <td className="p-2.5 font-bold text-orange-400">Present Value of FCF</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold">{formatMillions(p.pv_fcff)}</td>)}
          <td className="p-2.5 text-right font-mono font-bold bg-sky-950/10">{formatMillions(pvTerminal)}</td>
        </tr>
        <tr><td colSpan={colSpan} className="h-5"></td></tr>

        {/* === Enterprise → Equity Bridge === */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Enterprise Value</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(ev)}</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">Projection Period</td>
          <td className="p-2.5 text-right font-mono">{formatMillions(pvFCFFTotal)}</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{ev > 0 ? formatRatio(pvFCFFTotal / ev) : "0.0%"}</td>
          <td colSpan={rows.length - 1} className="p-2.5"></td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">Terminal Value</td>
          <td className="p-2.5 text-right font-mono">{formatMillions(pvTerminal)}</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{ev > 0 ? formatRatio(pvTerminal / ev) : "0.0%"}</td>
          <td colSpan={rows.length - 1} className="p-2.5"></td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">(−) Current Net Debt</td>
          <td className="p-2.5 text-right font-mono">{netDebt < 0 ? `(${formatMillions(Math.abs(netDebt))})` : formatMillions(netDebt)}</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Equity Value</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(equity)}</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">(/) Outstanding Shares</td>
          <td className="p-2.5 text-right font-mono">{formatMillions(sharesOut)}</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
        <tr className="bg-primary/5 rounded-b-lg">
          <td className="p-3 font-bold text-base">Fair Price</td>
          <td className={`p-3 text-right font-mono font-bold text-lg ${getUpsideColor(upsidePercent)}`}>${fairValue.toFixed(2)}</td>
          <td colSpan={rows.length} className="p-3"></td>
        </tr>
      </tbody>
    </table>
  );
}

function RevenueTab({
  rows, baseYear, ratios,
}: {
  rows: DCFFCFFProjectionYear[];
  baseYear: { year: number; revenue: number; cogs: number; sga: number; rnd: number; interest_expense: number; tax: number; net_income: number };
  ratios: { cogs_pct: number; sga_pct: number; rnd_pct: number; interest_pct: number; tax_rate: number };
}) {
  const baseRevenue = baseYear.revenue;
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold text-sm"></th>
          <th className="text-right p-2.5 font-semibold text-sm bg-muted/80">
            <div>{baseYear.year}</div>
            <div className="text-[10px] text-muted-foreground font-normal">actual</div>
          </th>
          {rows.map((p) => (
            <th key={p.year} className="text-right p-2.5 font-semibold text-sm">
              <div>{p.year}</div>
              <div className="text-[10px] text-muted-foreground font-normal">projected</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* Revenue */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Revenue</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400 bg-muted/40">{formatMillions(baseRevenue)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.revenue)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-muted-foreground pl-4">% Growth</td>
          <td className="p-2.5 text-right font-mono text-xs text-muted-foreground bg-muted/40"></td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-xs text-muted-foreground">{(p.revenue_growth * 100).toFixed(0)}%</td>)}
        </tr>
        <tr><td colSpan={rows.length + 2} className="h-1"></td></tr>

        {/* COGS */}
        <ExpenseRow label="Cost of Goods Sold" baseVal={baseYear.cogs} baseRev={baseRevenue} values={rows.map(p => p.cogs)} revenues={rows.map(p => p.revenue)} />
        <ExpenseRow label="SG&A Expenses" baseVal={baseYear.sga} baseRev={baseRevenue} values={rows.map(p => p.sga)} revenues={rows.map(p => p.revenue)} />
        <ExpenseRow label="R&D Expenses" baseVal={baseYear.rnd} baseRev={baseRevenue} values={rows.map(p => p.rnd)} revenues={rows.map(p => p.revenue)} />
        <ExpenseRow label="Net Interest" baseVal={baseYear.interest_expense} baseRev={baseRevenue} values={rows.map(p => p.interest_expense)} revenues={rows.map(p => p.revenue)} />

        {/* Tax */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Tax Expense</td>
          <td className="p-2.5 text-right font-mono bg-muted/40">({formatMillions(baseYear.tax)})</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono">({formatMillions(p.tax)})</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-muted-foreground pl-4">Tax Rate</td>
          <td className="p-2.5 text-right font-mono text-xs text-muted-foreground bg-muted/40">
            {baseYear.revenue > 0 ? (baseYear.tax / (baseYear.revenue - baseYear.cogs - baseYear.sga - baseYear.rnd - baseYear.interest_expense) * 100).toFixed(0) : 0}%
          </td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-xs text-muted-foreground">{(ratios.tax_rate * 100).toFixed(0)}%</td>)}
        </tr>
        <tr><td colSpan={rows.length + 2} className="h-1"></td></tr>

        {/* Net Profit */}
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Net Profit</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400 bg-muted/40">{formatMillions(baseYear.net_income)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.net_income)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-muted-foreground pl-4">% Margin</td>
          <td className="p-2.5 text-right font-mono text-xs text-muted-foreground bg-muted/40">
            {baseRevenue > 0 ? ((baseYear.net_income / baseRevenue) * 100).toFixed(0) : 0}%
          </td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-xs text-muted-foreground">
            {p.revenue > 0 ? ((p.net_income / p.revenue) * 100).toFixed(0) : 0}%
          </td>)}
        </tr>
      </tbody>
    </table>
  );
}

function CapExDATab({
  rows, daSchedule,
}: {
  rows: DCFFCFFProjectionYear[];
  daSchedule: { useful_life: number; vintages: { capex_year: number; amounts: number[] }[]; totals: number[] };
}) {
  return (
    <div className="space-y-6">
      {/* CapEx Projection */}
      <div>
        <h4 className="text-sm font-semibold text-orange-400 mb-3">Capital Expenditure Plan</h4>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-2.5 font-semibold"></th>
              {rows.map((p) => <th key={p.year} className="text-right p-2.5 font-semibold">{p.year}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b hover:bg-muted/20">
              <td className="p-2.5 font-bold text-orange-400">CapEx</td>
              {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.capex)}</td>)}
            </tr>
            <tr className="border-b hover:bg-muted/20">
              <td className="p-2.5 text-xs text-muted-foreground pl-4">% of Revenue</td>
              {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-xs text-muted-foreground">
                {p.revenue > 0 ? ((p.capex / p.revenue) * 100).toFixed(0) : 0}%
              </td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* D&A Schedule */}
      <div>
        <h4 className="text-sm font-semibold text-orange-400 mb-1">Depreciation & Amortization Schedule</h4>
        <p className="text-xs text-muted-foreground mb-3">Average useful life: {daSchedule.useful_life} years</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-2.5 font-semibold text-xs">For CapEx in</th>
              {rows.map((p) => <th key={p.year} className="text-right p-2.5 font-semibold text-xs">{p.year}</th>)}
            </tr>
          </thead>
          <tbody>
            {daSchedule.vintages.map((v) => (
              <tr key={v.capex_year} className="border-b hover:bg-muted/20">
                <td className="p-2 text-muted-foreground text-xs font-medium">{v.capex_year}</td>
                {v.amounts.map((amt, i) => (
                  <td key={i} className="p-2 text-right font-mono text-xs text-muted-foreground">
                    {amt > 0 ? formatMillions(amt) : ""}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
              <td className="p-2.5 font-bold text-orange-400">Total D&A</td>
              {daSchedule.totals.map((t, i) => (
                <td key={i} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(t)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkingCapitalTab({
  wc, baseYear,
}: {
  wc: {
    dso: number; dpo: number; dio: number;
    years: number[]; receivables: number[]; payables: number[];
    inventory: number[]; nwc: number[]; delta_nwc: number[];
  };
  baseYear: { year: number; nwc: number };
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold text-sm"></th>
          <th className="text-right p-2.5 font-semibold text-sm text-muted-foreground">Hist Avg</th>
          <th className="text-right p-2.5 font-semibold text-sm bg-muted/80">{baseYear.year}</th>
          {wc.years.map((y) => <th key={y} className="text-right p-2.5 font-semibold text-sm">{y}</th>)}
        </tr>
      </thead>
      <tbody>
        {/* Receivables */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-blue-400 font-medium">Days Receivable</td>
          <td className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dso}</td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.years.map((_, i) => <td key={i} className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dso}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Trade Receivables</td>
          <td className="p-2.5"></td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.receivables.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{formatMillions(v)}</td>)}
        </tr>
        <tr><td colSpan={wc.years.length + 3} className="h-1"></td></tr>

        {/* Payables */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-blue-400 font-medium">Days Payable</td>
          <td className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dpo}</td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.years.map((_, i) => <td key={i} className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dpo}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Trade Payables</td>
          <td className="p-2.5"></td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.payables.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">({formatMillions(v)})</td>)}
        </tr>
        <tr><td colSpan={wc.years.length + 3} className="h-1"></td></tr>

        {/* Inventory */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-xs text-blue-400 font-medium">Days Inventory</td>
          <td className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dio}</td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.years.map((_, i) => <td key={i} className="p-2.5 text-right font-mono text-xs text-blue-400">{wc.dio}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Inventory</td>
          <td className="p-2.5"></td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.inventory.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{formatMillions(v)}</td>)}
        </tr>
        <tr><td colSpan={wc.years.length + 3} className="h-1"></td></tr>

        {/* NWC */}
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-semibold">Net Working Capital</td>
          <td className="p-2.5"></td>
          <td className="p-2.5 text-right font-mono font-semibold bg-muted/40">{formatMillions(baseYear.nwc)}</td>
          {wc.nwc.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-semibold">{formatMillions(v)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Change in NWC</td>
          <td className="p-2.5"></td>
          <td className="p-2.5 bg-muted/40"></td>
          {wc.delta_nwc.map((v, i) => (
            <td key={i} className="p-2.5 text-right font-mono font-bold text-orange-400">
              {v < 0 ? `(${formatMillions(Math.abs(v))})` : formatMillions(v)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ============================================================
// Shared Row Helpers
// ============================================================

function Row({
  label, values, terminal, muted = false,
}: {
  label: string; values: number[]; terminal: number; muted?: boolean;
}) {
  const cls = muted ? "text-muted-foreground" : "";
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className={`p-2.5 font-medium ${cls}`}>{label}</td>
      {values.map((v, i) => <td key={i} className={`p-2.5 text-right font-mono ${cls}`}>{formatMillions(v)}</td>)}
      <td className={`p-2.5 text-right font-mono bg-sky-950/10 ${cls}`}>{formatMillions(terminal)}</td>
    </tr>
  );
}

function ExpenseRow({
  label, baseVal, baseRev, values, revenues,
}: {
  label: string; baseVal: number; baseRev: number; values: number[]; revenues: number[];
}) {
  return (
    <>
      <tr className="border-b hover:bg-muted/20">
        <td className="p-2.5 font-medium">{label}</td>
        <td className="p-2.5 text-right font-mono bg-muted/40">({formatMillions(baseVal)})</td>
        {values.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">({formatMillions(v)})</td>)}
      </tr>
      <tr className="border-b hover:bg-muted/20">
        <td className="p-2.5 text-xs text-muted-foreground pl-4">% of Revenue</td>
        <td className="p-2.5 text-right font-mono text-xs text-muted-foreground bg-muted/40">
          {baseRev > 0 ? ((baseVal / baseRev) * 100).toFixed(0) : 0}%
        </td>
        {values.map((v, i) => (
          <td key={i} className="p-2.5 text-right font-mono text-xs text-muted-foreground">
            {revenues[i] > 0 ? ((v / revenues[i]) * 100).toFixed(0) : 0}%
          </td>
        ))}
      </tr>
    </>
  );
}
