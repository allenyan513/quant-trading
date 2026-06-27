"use client";

// Financials tab — grouped ratios for the latest period:
// valuation / profitability / health / per-share.

import { Card, Grid } from "@/components/ui";
import { money, formatRatio } from "@/lib/format";
import { type Row, num, div, add } from "./shared";

export function RatioGroups({ income, balance, cashflow, ratios }: { income: Row[]; balance: Row[]; cashflow: Row[]; ratios: Row[] }) {
  const li = income.at(-1)?.data ?? {};
  const lb = balance.at(-1)?.data ?? {};
  const lc = cashflow.at(-1)?.data ?? {};
  const lr = ratios.at(-1)?.data ?? {};
  const asOf = income.at(-1)?.fiscalDate?.slice(0, 4) ?? "";

  const ratioX = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
  const pct = (v: number | null) => (v == null ? "—" : formatRatio(v));
  const usd = (v: number | null) => (v == null ? "—" : money(v, "cell"));
  const shares = num(li, "weightedAverageShsOutDil");
  const fcf = num(lc, "freeCashFlow") ?? add(num(lc, "operatingCashFlow"), num(lc, "capitalExpenditure"));

  const groups: { title: string; items: [string, string][] }[] = [
    { title: "Valuation", items: [["P/E", ratioX(num(lr, "priceToEarningsRatio"))], ["P/S", ratioX(num(lr, "priceToSalesRatio"))], ["P/B", ratioX(num(lr, "priceToBookRatio"))], ["EV/EBITDA", ratioX(num(lr, "enterpriseValueMultiple"))]] },
    { title: "Profitability", items: [["Gross margin", pct(div(num(li, "grossProfit"), num(li, "revenue")))], ["Operating margin", pct(div(num(li, "operatingIncome"), num(li, "revenue")))], ["Net margin", pct(div(num(li, "netIncome"), num(li, "revenue")))], ["ROE", pct(div(num(li, "netIncome"), num(lb, "totalStockholdersEquity")))], ["ROA", pct(div(num(li, "netIncome"), num(lb, "totalAssets")))]] },
    { title: "Financial health", items: [["Debt/Equity", ratioX(div(num(lb, "totalDebt"), num(lb, "totalStockholdersEquity")))], ["NetDebt/EBITDA", ratioX(div(num(lb, "netDebt"), num(li, "ebitda")))], ["Interest coverage", ratioX(div(num(li, "operatingIncome"), num(li, "interestExpense")))]] },
    { title: "Per share", items: [["EPS (diluted)", usd(num(li, "epsDiluted"))], ["FCF/share", usd(div(fcf, shares))], ["Book value/share", usd(div(num(lb, "totalStockholdersEquity"), shares))]] },
  ];

  return (
    <Card title={`Ratios${asOf ? ` · Latest FY${asOf}` : ""}`}>
      <Grid min={200}>
        {groups.map((g) => (
          <div key={g.title}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{g.title}</div>
            <div style={{ display: "grid", gap: 4 }}>
              {g.items.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Grid>
    </Card>
  );
}
