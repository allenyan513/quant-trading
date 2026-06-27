"use client";

import { Outlet, useParams } from "react-router-dom";
import Link from "@/components/link";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { LegendTabs } from "@/components/legend-tabs";
import { fmtMoney, fmtQuarter, fmtDay } from "@/lib/format";

interface FilerHeader {
  name: string | null;
  quarter: string | null;
  stockCount: number;
  portfolioValue: number;
}

/**
 * Shared chrome for one legend's 13F detail: breadcrumb + a dataroma-style header
 * (Period / Portfolio date / No. of stocks / Portfolio value) + the tab bar. Converted
 * from web's server component to a client fetch (`GET /api/legends/:cik/header`).
 */
export default function LegendLayout() {
  const { cik = "" } = useParams<{ cik: string }>();
  const { data: header } = useLive<FilerHeader>(`/api/legends/${cik}/header`);
  const name = header?.name ?? "";
  const quarter = header?.quarter ?? null;

  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--muted)", minWidth: 92 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );

  return (
    <div>
      <PageTitle sub={name}>
        <Link href="/workspace/discover/legends" style={{ color: "var(--muted)" }}>
          Legends 13F
        </Link>{" "}
        / {name || cik}
      </PageTitle>

      {quarter ? (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 6, marginBottom: 4 }}>
          {stat("Period", fmtQuarter(quarter))}
          {stat("Portfolio date", fmtDay(quarter))}
          {stat("No. of stocks", (header?.stockCount ?? 0).toLocaleString())}
          {stat("Portfolio value", fmtMoney(header?.portfolioValue ?? 0))}
        </div>
      ) : (
        <p style={{ color: "var(--muted)", marginTop: 0 }}>No holdings synced yet.</p>
      )}

      <LegendTabs />
      <Outlet />
    </div>
  );
}
