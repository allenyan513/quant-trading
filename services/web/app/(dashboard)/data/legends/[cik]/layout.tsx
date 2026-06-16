import Link from "next/link";
import { notFound } from "next/navigation";
import { get13fFilerHeader } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";
import { LegendTabs } from "@/components/legend-tabs";
import { fmtMoney, fmtQuarter, fmtDay } from "@/lib/format";

// Reads the DB (filer header) per request — never statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Shared chrome for one legend's 13F detail: breadcrumb + a dataroma-style header
 * (Period / Portfolio date / No. of stocks / Portfolio value) + the tab bar. The
 * header persists across tabs; only the tab body ({children}) swaps. Read-only.
 */
export default async function LegendLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cik: string }>;
}) {
  const { cik } = await params;
  const { name, quarter, stockCount, portfolioValue } = await get13fFilerHeader(cik);
  if (!name) notFound();

  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--muted)", minWidth: 92 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );

  return (
    <div>
      <PageTitle subsystem="data" sub={name}>
        <Link href="/data/legends" style={{ color: "var(--muted)", textDecoration: "none" }}>
          Legends 13F
        </Link>{" "}
        / {name}
      </PageTitle>

      {quarter ? (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 6, marginBottom: 4 }}>
          {stat("Period", fmtQuarter(quarter))}
          {stat("Portfolio date", fmtDay(quarter))}
          {stat("No. of stocks", stockCount.toLocaleString())}
          {stat("Portfolio value", fmtMoney(portfolioValue))}
        </div>
      ) : (
        <p style={{ color: "var(--muted)", marginTop: 0 }}>No holdings synced yet.</p>
      )}

      <LegendTabs />
      {children}
    </div>
  );
}
