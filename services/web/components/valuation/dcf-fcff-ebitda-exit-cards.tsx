"use client";

import { useState, useMemo } from "react";
import type { ValuationResult, DCFFCFFProjectionYear, PeerEBITDARow } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";
import { ValuationHero } from "./valuation-hero";
import { ParamInput, highlightNarrative } from "./shared-dcf-ui";
import { formatMillions, formatRatio } from "@/lib/format";

function Row({ label, values, terminal, muted }: {
  label: string; values: number[]; terminal: number | null; muted?: boolean;
}) {
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className={`p-2.5 ${muted ? "text-muted-foreground pl-4" : "font-medium"}`}>{label}</td>
      {values.map((v, i) => <td key={i} className={`p-2.5 text-right font-mono ${muted ? "text-muted-foreground" : ""}`}>{formatMillions(v)}</td>)}
      <td className={`p-2.5 text-right font-mono bg-sky-950/10 ${muted ? "text-muted-foreground" : ""}`}>
        {terminal === null ? <span className="text-muted-foreground/40">—</span> : formatMillions(terminal)}
      </td>
    </tr>
  );
}

// --- Tab definitions ---
const TABS = [
  { id: "fcf", label: "Terminal Value" },
  { id: "multiples", label: "Multiples" },
  { id: "revenue", label: "Revenue & Expenses" },
  { id: "capex-da", label: "CapEx & D&A" },
  { id: "working-capital", label: "Working Capital" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// --- Component ---

interface Props {
  model: ValuationResult;
  currentPrice: number;
  narrative?: string;
  peers: PeerEBITDARow[];
}

export function DCFFCFFEBITDAExitCards({ model, currentPrice, narrative, peers }: Props) {
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
  const projectionYears = (details.projection_years as number | undefined) ?? 5;

  const defaultWACC = waccRaw != null
    ? Math.round(waccRaw * 10000) / 100
    : (assumptions.wacc as number);
  const defaultMultiple = assumptions.peer_ev_ebitda_multiple as number;

  const [wacc, setWACC] = useState(defaultWACC);
  const [multiple, setMultiple] = useState(defaultMultiple);
  const [activeTab, setActiveTab] = useState<TabId>("fcf");

  const isCustom = wacc !== defaultWACC || multiple !== defaultMultiple;
  const resetDefaults = () => { setWACC(defaultWACC); setMultiple(defaultMultiple); };

  const numYears = projections.length; // 5 or 10

  const calc = useMemo(() => {
    // Use raw precision when at defaults to match server fair_value exactly
    const w = !isCustom && waccRaw != null ? waccRaw : wacc / 100;
    const rows = projections.map((p) => {
      const df = 1 / Math.pow(1 + w, p.timing);
      return { ...p, discount_factor: df, pv_fcff: p.fcff * df };
    });
    const pvFCFFTotal = rows.reduce((sum, p) => sum + p.pv_fcff, 0);
    const tv = terminalYear.ebitda * multiple;
    const pvTV = tv / Math.pow(1 + w, projectionYears);
    const ev = pvFCFFTotal + pvTV;
    const equity = ev - netDebt;
    const fairValue = Math.max(0, equity / sharesOut);
    const upsidePercent = ((fairValue - currentPrice) / currentPrice) * 100;
    return { rows, pvFCFFTotal, tv, pvTV, ev, equity, fairValue, upsidePercent };
  }, [wacc, multiple, projections, terminalYear, netDebt, sharesOut, currentPrice, projectionYears, isCustom, waccRaw]);

  const sm = details.sensitivity_matrix as Record<string, unknown>;
  const discountRateValues = sm.discount_rate_values as number[];
  const multipleValues = sm.multiple_values as number[];
  const smPrices = sm.prices as number[][];

  // Subject company (first row) and industry median for peers display
  const subjectRow = peers[0];
  const peerRows = peers.slice(1);
  const validTrailing = peerRows.map((p) => p.trailing_ev_ebitda).filter((v): v is number => v !== null);
  const validForward = peerRows.map((p) => p.forward_ev_ebitda).filter((v): v is number => v !== null);
  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };
  const trailingMedian = median(validTrailing);
  const forwardMedian = median(validForward);

  return (
    <div className="space-y-6">
      {/* Card 1: ValuationHero */}
      <ValuationHero
        fairValue={calc.fairValue}
        currentPrice={currentPrice}
        upside={calc.upsidePercent}
        customLabel={isCustom ? <span className="text-amber-400 normal-case ml-1">(custom)</span> : undefined}
        narrative={narrative ? highlightNarrative(narrative) : undefined}
      />

      {/* Card 2: FCFF Calculation */}
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

        {/* Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
          <ParamInput label="WACC" value={wacc} onChange={setWACC} min={3} max={20} step={0.25} suffix="%" />
          <ParamInput label="EV/EBITDA Exit Multiple" value={multiple} onChange={setMultiple} min={1} max={40} step={0.5} suffix="x" />
          <div className="text-center p-4 rounded-xl border border-border/60 bg-muted/30">
            <div className="text-sm text-muted-foreground mb-2">Forecast Period</div>
            <div className="text-xl font-bold font-mono">5 Yrs</div>
            <div className="text-[11px] text-muted-foreground mt-1.5">+ Terminal Year</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4 text-center">
          Adjust parameters to explore scenarios. Changes are for exploration only and do not affect saved valuations.
        </p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1 mb-4">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div className="flex justify-end mb-2">
            <span className="text-xs text-muted-foreground">Currency: USD &nbsp; Millions</span>
          </div>

          {activeTab === "fcf" && (
            <FCFSummaryTab
              rows={calc.rows} terminalYear={terminalYear} wacc={wacc} multiple={multiple}
              pvTerminal={calc.pvTV} tv={calc.tv} ev={calc.ev} pvFCFFTotal={calc.pvFCFFTotal}
              netDebt={netDebt} equity={calc.equity} sharesOut={sharesOut}
              fairValue={calc.fairValue} upsidePercent={calc.upsidePercent}
            />
          )}
          {activeTab === "multiples" && (
            <MultiplesTab
              subjectRow={subjectRow} peerRows={peerRows}
              trailingMedian={trailingMedian} forwardMedian={forwardMedian}
              selectedMultiple={multiple}
              modelMultiple={defaultMultiple}
            />
          )}
          {activeTab === "revenue" && <RevenueTab rows={calc.rows} baseYear={baseYear} ratios={expenseRatios} />}
          {activeTab === "capex-da" && <CapExDATab rows={calc.rows} daSchedule={daSchedule} />}
          {activeTab === "working-capital" && <WorkingCapitalTab wc={wc} baseYear={baseYear} />}
        </div>
      </div>

      {/* Card 3: Sensitivity */}
      <div className="val-card">
        <h3 className="val-card-title">Sensitivity Analysis</h3>
        <SensitivityHeatmap
          waccValues={discountRateValues}
          secondAxisValues={multipleValues}
          prices={smPrices}
          currentPrice={currentPrice}
          xLabel="EV/EBITDA Exit Multiple"
          isPercent={false}
        />
        <p className="text-xs text-muted-foreground text-center mt-2">Based on default parameters</p>
      </div>
    </div>
  );
}

// ============================================================
// Tab Components
// ============================================================

function FCFSummaryTab({
  rows, terminalYear, wacc, multiple, pvTerminal, tv,
  ev, pvFCFFTotal, netDebt, equity, sharesOut, fairValue, upsidePercent,
}: {
  rows: (DCFFCFFProjectionYear & { pv_fcff: number })[];
  terminalYear: DCFFCFFProjectionYear;
  wacc: number;
  multiple: number;
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
          <th className="text-right p-2.5 font-semibold text-sm bg-sky-950/20">Terminal</th>
        </tr>
      </thead>
      <tbody>
        <Row label="Profit Before Tax" values={rows.map(p => p.income_before_tax)} terminal={terminalYear.income_before_tax} />
        <Row label="(−) Net Interest" values={rows.map(p => p.interest_expense)} terminal={terminalYear.interest_expense} muted />
        <Row label="(+) D&A" values={rows.map(p => p.depreciation)} terminal={terminalYear.depreciation} muted />
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">EBITDA</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.ebitda)}</td>)}
          <td className="p-2.5 text-right font-mono font-bold text-orange-400 bg-sky-950/10">{formatMillions(terminalYear.ebitda)}</td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        <Row label="(−) Tax" values={rows.map(p => p.tax)} terminal={null} muted />
        <Row label="(−) CapEx" values={rows.map(p => p.capex)} terminal={null} muted />
        <Row label="(−) ΔWC" values={rows.map(p => p.delta_nwc)} terminal={null} muted />
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Free Cash Flow (FCF)</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.fcff)}</td>)}
          <td className="p-2.5 text-right font-mono bg-sky-950/10 text-muted-foreground/40">—</td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        {/* Terminal value via EBITDA × multiple */}
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-semibold text-orange-400">Peers&apos; EBITDA Multiple</td>
          {rows.map((p) => <td key={p.year} className="p-2.5"></td>)}
          <td className="p-2.5 text-right font-mono font-semibold text-orange-400 bg-sky-950/10">{multiple.toFixed(1)}x</td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-semibold text-orange-400">Terminal Value</td>
          {rows.map((p) => <td key={p.year} className="p-2.5"></td>)}
          <td className="p-2.5 text-right font-mono font-semibold text-orange-400 bg-sky-950/10">{formatMillions(tv)}</td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium text-muted-foreground">WACC / Discount Rate</td>
          <td className="p-2.5 text-right font-mono font-semibold">{wacc.toFixed(2)}%</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr><td colSpan={colSpan} className="h-1.5"></td></tr>

        {/* Discounting */}
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

        {/* EV → Equity bridge */}
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
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Equity Value</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(equity)}</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">(÷) Outstanding Shares</td>
          <td className="p-2.5 text-right font-mono">{(sharesOut / 1e6).toFixed(0)}M</td>
          <td colSpan={rows.length} className="p-2.5"></td>
        </tr>
        <tr className="bg-primary/5">
          <td className="p-2.5 font-bold text-orange-400">Fair Price</td>
          <td className="p-2.5 text-right font-mono font-bold text-orange-400">${fairValue.toFixed(0)}</td>
          <td className="p-2.5 text-right font-mono text-sm" style={{ color: upsidePercent >= 0 ? "var(--color-green-400)" : "var(--color-red-400)" }}>
            {upsidePercent >= 0 ? "+" : ""}{upsidePercent.toFixed(1)}%
          </td>
          <td colSpan={rows.length - 1} className="p-2.5"></td>
        </tr>
      </tbody>
    </table>
  );
}

function MultiplesTab({
  subjectRow, peerRows, trailingMedian, forwardMedian, selectedMultiple, modelMultiple,
}: {
  subjectRow: PeerEBITDARow | undefined;
  peerRows: PeerEBITDARow[];
  trailingMedian: number | null;
  forwardMedian: number | null;
  selectedMultiple: number;
  modelMultiple: number;
}) {
  const fmt = (v: number | null) => v !== null ? `${v.toFixed(1)}x` : "—";

  const modelMatchesMedian = trailingMedian !== null && Math.abs(modelMultiple - trailingMedian) < 0.5;

  if (!subjectRow && peerRows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Peer data unavailable — the EV/EBITDA exit multiple was derived from the most recent valuation run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-2.5 font-semibold">Company</th>
            <th className="text-right p-2.5 font-semibold">Market Cap (USD mil)</th>
            <th className="text-right p-2.5 font-semibold">Trailing EV/EBITDA</th>
            <th className="text-right p-2.5 font-semibold">Forward EV/EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {/* Subject company */}
          {subjectRow && (
            <tr className="border-b bg-primary/10">
              <td className="p-2.5 font-semibold text-primary">{subjectRow.name}</td>
              <td className="p-2.5 text-right font-mono">{Math.round(subjectRow.market_cap / 1e6).toLocaleString("en-US")}</td>
              <td className="p-2.5 text-right font-mono font-semibold text-primary">{fmt(subjectRow.trailing_ev_ebitda)}</td>
              <td className="p-2.5 text-right font-mono font-semibold text-primary">{fmt(subjectRow.forward_ev_ebitda)}</td>
            </tr>
          )}
          {/* Peers */}
          {peerRows.map((peer) => (
            <tr key={peer.ticker} className="border-b hover:bg-muted/20">
              <td className="p-2.5 font-medium">{peer.name}</td>
              <td className="p-2.5 text-right font-mono text-muted-foreground">
                {Math.round(peer.market_cap / 1e6).toLocaleString("en-US")}
              </td>
              <td className="p-2.5 text-right font-mono">{fmt(peer.trailing_ev_ebitda)}</td>
              <td className="p-2.5 text-right font-mono">{fmt(peer.forward_ev_ebitda)}</td>
            </tr>
          ))}
          {/* Industry median (recomputed from displayed peers) */}
          {(trailingMedian !== null || forwardMedian !== null) && (
            <tr className="border-t-2 border-t-foreground/20 hover:bg-muted/20">
              <td className="p-2.5 font-semibold text-orange-400">Industry Median</td>
              <td className="p-2.5"></td>
              <td className="p-2.5 text-right font-mono font-semibold text-orange-400">{fmt(trailingMedian)}</td>
              <td className="p-2.5 text-right font-mono font-semibold text-orange-400">{fmt(forwardMedian)}</td>
            </tr>
          )}
          {/* Model multiple — the value actually used for terminal value at valuation time */}
          <tr className="border-t border-muted/30 bg-sky-950/10 hover:bg-sky-950/20">
            <td className="p-2.5 font-semibold text-orange-400">Used in Model</td>
            <td className="p-2.5"></td>
            <td className="p-2.5 text-right font-mono font-semibold text-orange-400">{modelMultiple.toFixed(1)}x</td>
            <td className="p-2.5"></td>
          </tr>
        </tbody>
      </table>

      {/* Explanation */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-2">
        <p>
          <span className="font-semibold text-orange-400">Industry Median</span>{" "}
          is computed from the trailing EV/EBITDA of the peers shown above (excluding the subject company).
          Trailing EV/EBITDA = (Market Cap + Net Debt) ÷ Last 12-Month EBITDA.
          The forward column uses next-year revenue estimates × historical EBITDA margin.
        </p>
        <p>
          <span className="font-semibold text-orange-400">Used in Model</span>{" "}
          is the trailing peer median that was locked in when this valuation was last computed.
          {modelMatchesMedian
            ? " It matches the current Industry Median — peer data has not changed since the last valuation run."
            : " It may differ from the current Industry Median because peer market caps or EBITDA data have been updated since the last valuation run, or because the peer list returned by FMP differed slightly at that time."}
        </p>
        <p>
          The <span className="font-semibold text-foreground">Terminal Value</span> = Year 6 EBITDA × <span className="font-semibold text-orange-400">Used in Model</span> multiple.
          This anchors the exit value to how the market currently prices comparable companies,
          rather than assuming perpetual cash flow growth.
        </p>
      </div>
    </div>
  );
}

function RevenueTab({
  rows, baseYear, ratios,
}: {
  rows: DCFFCFFProjectionYear[];
  baseYear: { year: number; revenue: number; cogs: number; sga: number; rnd: number; interest_expense: number; tax: number; net_income: number };
  ratios: { cogs_pct: number; sga_pct: number; rnd_pct: number; interest_pct: number; tax_rate: number };
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold"></th>
          <th className="text-right p-2.5 font-semibold text-muted-foreground">{baseYear.year} (A)</th>
          {rows.map((p) => <th key={p.year} className="text-right p-2.5 font-semibold">{p.year}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Revenue</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.revenue)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.revenue)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">Growth %</td>
          <td className="p-2.5"></td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatRatio(p.revenue_growth)}</td>)}
        </tr>
        <tr><td colSpan={rows.length + 2} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">(−) COGS ({formatRatio(ratios.cogs_pct)})</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.cogs)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(p.cogs)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Gross Profit</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.revenue - baseYear.cogs)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono">{formatMillions(p.gross_profit)}</td>)}
        </tr>
        <tr><td colSpan={rows.length + 2} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">(−) SG&A ({formatRatio(ratios.sga_pct)})</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.sga)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(p.sga)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">(−) R&D ({formatRatio(ratios.rnd_pct)})</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.rnd)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(p.rnd)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Operating Income (EBIT)</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.revenue - baseYear.cogs - baseYear.sga - baseYear.rnd)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono">{formatMillions(p.operating_income)}</td>)}
        </tr>
        <tr><td colSpan={rows.length + 2} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">(−) Interest ({formatRatio(ratios.interest_pct)})</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.interest_expense)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(p.interest_expense)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Profit Before Tax</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.revenue - baseYear.cogs - baseYear.sga - baseYear.rnd - baseYear.interest_expense)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono">{formatMillions(p.income_before_tax)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground pl-4">(−) Tax ({formatRatio(ratios.tax_rate)})</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.tax)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(p.tax)}</td>)}
        </tr>
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-bold text-orange-400">Net Income</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.net_income)}</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(p.net_income)}</td>)}
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
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold"></th>
          {rows.map((p) => <th key={p.year} className="text-right p-2.5 font-semibold">{p.year}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium text-orange-400">CapEx</td>
          {rows.map((p) => <td key={p.year} className="p-2.5 text-right font-mono text-orange-400">{formatMillions(p.capex)}</td>)}
        </tr>
        <tr><td colSpan={rows.length + 1} className="h-1.5"></td></tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground text-xs" colSpan={rows.length + 1}>
            D&A Vintage Matrix — each row = CapEx year, depreciated straight-line over {daSchedule.useful_life} years
          </td>
        </tr>
        {daSchedule.vintages.map((v) => (
          <tr key={v.capex_year} className="border-b hover:bg-muted/20">
            <td className="p-2.5 text-muted-foreground pl-4 text-xs">{v.capex_year} CapEx</td>
            {v.amounts.map((a, i) => (
              <td key={i} className={`p-2.5 text-right font-mono text-xs ${a === 0 ? "text-muted-foreground/30" : "text-muted-foreground"}`}>
                {a === 0 ? "—" : formatMillions(a)}
              </td>
            ))}
          </tr>
        ))}
        <tr className="border-b border-t-2 border-t-foreground/20 bg-primary/5">
          <td className="p-2.5 font-bold text-orange-400">Total D&A</td>
          {daSchedule.totals.map((t, i) => <td key={i} className="p-2.5 text-right font-mono font-bold text-orange-400">{formatMillions(t)}</td>)}
        </tr>
      </tbody>
    </table>
  );
}

function WorkingCapitalTab({
  wc, baseYear,
}: {
  wc: { dso: number; dpo: number; dio: number; years: number[]; receivables: number[]; payables: number[]; inventory: number[]; nwc: number[]; delta_nwc: number[] };
  baseYear: { nwc: number };
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2.5 font-semibold"></th>
          <th className="text-right p-2.5 font-semibold text-muted-foreground">Base</th>
          {wc.years.map((y) => <th key={y} className="text-right p-2.5 font-semibold">{y}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">Receivables (DSO: {wc.dso}d)</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">—</td>
          {wc.receivables.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(v)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">(−) Payables (DPO: {wc.dpo}d)</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">—</td>
          {wc.payables.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(v)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 text-muted-foreground">(+) Inventory (DIO: {wc.dio}d)</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">—</td>
          {wc.inventory.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(v)}</td>)}
        </tr>
        <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20">
          <td className="p-2.5 font-medium text-orange-400">Net Working Capital</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(baseYear.nwc)}</td>
          {wc.nwc.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-orange-400">{formatMillions(v)}</td>)}
        </tr>
        <tr className="border-b hover:bg-muted/20">
          <td className="p-2.5 font-medium">Δ Change in NWC</td>
          <td className="p-2.5 text-right font-mono text-muted-foreground">—</td>
          {wc.delta_nwc.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{formatMillions(v)}</td>)}
        </tr>
      </tbody>
    </table>
  );
}
