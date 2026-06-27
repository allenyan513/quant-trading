"use client";

// Financials tab — forward estimates (prominent, top of page): analyst-consensus
// revenue + EPS for the next few fiscal years.

import { Card, Grid } from "@/components/ui";
import { formatLargeNumber, fmtPct } from "@/lib/format";
import { type Row, num, div } from "./shared";

export function ForwardEstimates({ income, estimates }: { income: Row[]; estimates: Row[] }) {
  const lastDate = income.at(-1)?.fiscalDate ?? "";
  const fwd = estimates.filter((e) => e.fiscalDate > lastDate).slice(0, 3);
  if (fwd.length === 0) return null;

  let prevRev = num(income.at(-1)?.data ?? {}, "revenue");
  let prevEps = num(income.at(-1)?.data ?? {}, "epsDiluted");
  const rows = fwd.map((e) => {
    const rev = num(e.data, "revenueAvg");
    const eps = num(e.data, "epsAvg");
    const revG = div(rev != null && prevRev != null ? rev - prevRev : null, prevRev != null ? Math.abs(prevRev) : null);
    const epsG = div(eps != null && prevEps != null ? eps - prevEps : null, prevEps != null ? Math.abs(prevEps) : null);
    prevRev = rev ?? prevRev;
    prevEps = eps ?? prevEps;
    const an = num(e.data, "numAnalystsRevenue") ?? num(e.data, "numAnalystsEps") ?? num(e.data, "numAnalysts");
    return { year: e.fiscalDate.slice(0, 4), rev, eps, revG, epsG, an };
  });
  const g = (v: number | null) => (v == null ? "" : <span style={{ color: v >= 0 ? "#3fb950" : "#f85149", fontWeight: 600, fontSize: 12 }}> {fmtPct(v * 100)}</span>);

  return (
    <Card title="Forward estimates · Analyst consensus" accent="#a371f7">
      <Grid min={190}>
        {rows.map((r) => (
          <div key={r.year} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, color: "#a371f7", fontWeight: 700, marginBottom: 6 }}>FY{r.year}E{r.an != null ? ` · ${r.an} analysts` : ""}</div>
            <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--muted)" }}>Revenue</span>
                <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{r.rev == null ? "—" : formatLargeNumber(r.rev)}{g(r.revG)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--muted)" }}>EPS</span>
                <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{r.eps == null ? "—" : r.eps.toFixed(2)}{g(r.epsG)}</span>
              </div>
            </div>
          </div>
        ))}
      </Grid>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>FMP only provides forward consensus for Revenue and EPS; these are also merged into the <span style={{ color: "#a371f7" }}>E</span> columns of the income statement below.</div>
    </Card>
  );
}
