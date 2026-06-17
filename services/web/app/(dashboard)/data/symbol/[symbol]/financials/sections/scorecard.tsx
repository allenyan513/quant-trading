"use client";

// Financials tab — quality scorecard: a few "is this a good business" signals
// from the multi-year trend.

import { Card, Grid, Badge } from "@/components/ui";
import { formatRatio, fmtPct } from "@/lib/format";
import { type Row, type Verdict, V_COLOR, num, div, add, byDate } from "./shared";

export function Scorecard({ income, cashflow, balance, ratios }: { income: Row[]; cashflow: Row[]; balance: Row[]; ratios: Row[] }) {
  const cf = byDate(cashflow);
  const bal = byDate(balance);
  const rat = byDate(ratios);
  const li = income.at(-1)?.data ?? {};
  const lastDate = income.at(-1)?.fiscalDate ?? "";
  const lb = bal.get(lastDate) ?? {};
  const lr = rat.get(lastDate) ?? {};

  // Annualized growth over the actual year span between the first and last
  // VALID (non-null, positive) data points — filtering can drop years, so the
  // exponent must use real calendar years, not income.length.
  const cagr = (field: string): number | null => {
    const pts = income
      .map((r) => ({ year: parseInt(r.fiscalDate.slice(0, 4), 10), val: num(r.data, field) }))
      .filter((x): x is { year: number; val: number } => x.val != null && x.val > 0);
    if (pts.length < 2) return null;
    const span = pts.at(-1)!.year - pts[0]!.year;
    return span > 0 ? Math.pow(pts.at(-1)!.val / pts[0]!.val, 1 / span) - 1 : null;
  };
  const revCagr = cagr("revenue");
  const dilution = cagr("weightedAverageShsOutDil");
  const fcfYears = income.map((r) => num(cf.get(r.fiscalDate) ?? {}, "freeCashFlow") ?? add(num(cf.get(r.fiscalDate) ?? {}, "operatingCashFlow"), num(cf.get(r.fiscalDate) ?? {}, "capitalExpenditure")));
  const fcfPos = fcfYears.filter((v) => v != null && v > 0).length;
  const fcfTotal = fcfYears.filter((v) => v != null).length;
  const netMargin = num(lr, "netProfitMargin") ?? div(num(li, "netIncome"), num(li, "revenue"));
  const roe = num(lr, "returnOnEquity") ?? div(num(li, "netIncome"), num(lb, "totalStockholdersEquity"));
  const grossMargin = num(lr, "grossProfitMargin") ?? div(num(li, "grossProfit"), num(li, "revenue"));
  const netDebtEbitda = div(num(lb, "netDebt"), num(li, "ebitda"));

  const band = (v: number | null, g: number, o: number, higher = true): Verdict | null => {
    if (v == null) return null;
    if (higher) return v >= g ? "good" : v >= o ? "ok" : "weak";
    return v <= g ? "good" : v <= o ? "ok" : "weak";
  };

  const items: { label: string; value: string; verdict: Verdict | null }[] = [
    { label: "营收 CAGR", value: revCagr == null ? "—" : fmtPct(revCagr * 100), verdict: band(revCagr, 0.1, 0.03) },
    { label: "毛利率", value: grossMargin == null ? "—" : formatRatio(grossMargin), verdict: band(grossMargin, 0.4, 0.2) },
    { label: "净利率", value: netMargin == null ? "—" : formatRatio(netMargin), verdict: band(netMargin, 0.15, 0.05) },
    { label: "ROE", value: roe == null ? "—" : formatRatio(roe), verdict: band(roe, 0.15, 0.08) },
    { label: "FCF 为正", value: fcfTotal ? `${fcfPos}/${fcfTotal} 年` : "—", verdict: fcfTotal ? band(fcfPos / fcfTotal, 0.99, 0.6) : null },
    { label: "NetDebt/EBITDA", value: netDebtEbitda == null ? "—" : `${netDebtEbitda.toFixed(1)}x`, verdict: band(netDebtEbitda, 1, 3, false) },
    { label: "股本稀释/年", value: dilution == null ? "—" : fmtPct(dilution * 100), verdict: band(dilution, 0, 0.03, false) },
  ];
  const score = items.filter((i) => i.verdict === "good").length;
  const rated = items.filter((i) => i.verdict != null).length;

  return (
    <Card title={`质量评分卡${rated ? ` · ${score}/${rated} 项优` : ""}`}>
      <Grid min={150}>
        {items.map((it) => (
          <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{it.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "ui-monospace, Menlo, monospace" }}>{it.value}</span>
              {it.verdict && <Badge color={V_COLOR[it.verdict]}>{it.verdict}</Badge>}
            </span>
          </div>
        ))}
      </Grid>
    </Card>
  );
}
