"use client";

/**
 * Holdings · Performance — NAV vs SPY (both rebased to 100 at inception) + the
 * full KPI row. Reads /api/holdings/nav (portfolio_holdings_nav_history + warmed SPY
 * closes). Chart via NavChartLazy (ssr:false). KPIs show "—" below their gate.
 */

import { useLive } from "@/components/live";
import { Card, Grid, Stat } from "@/components/ui";
import { NavChartLazy, type NavPoint } from "@/components/nav-chart.lazy";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";

interface Kpis {
  cagr: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  calmar: number | null;
  beta: number | null;
  alpha: number | null;
  informationRatio: number | null;
  treynor: number | null;
}

interface NavResponse {
  accountId: string;
  asOf: string | null;
  navIndex: number | null;
  endingNav: number | null;
  points: NavPoint[];
  kpis: Kpis | null;
}

/** Decimal (0.12) → "+12.0%". */
function pct(v: number | null): string {
  return v == null ? "—" : fmtPct(v * 100);
}
/** Plain ratio (Sharpe etc.) → "1.42". */
function ratio(v: number | null): string {
  return v == null ? "—" : fmtNum(v, 2);
}
function signColor(v: number | null): string | undefined {
  if (v == null) return undefined;
  return v >= 0 ? "#3fb950" : "#f85149";
}

export default function HoldingsPerformancePage() {
  const { data, error } = useLive<NavResponse>("/api/holdings/nav");

  return (
    <div>
      {error && <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>}
      {!data && !error && <p style={{ color: "var(--muted)" }}>Loading…</p>}

      {data && data.points.length === 0 && (
        <Card>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            No NAV data yet. Connect IBKR in Settings, then click "Refresh now".
          </p>
        </Card>
      )}

      {data && data.points.length > 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          <Grid min={150}>
            <Stat label="NAV (raw)" value={fmtMoney(data.endingNav)} sub={data.asOf ? `as of ${data.asOf}` : undefined} />
            <Stat label="NAV index" value={data.navIndex == null ? "—" : fmtNum(data.navIndex, 1)} sub="base 100" />
            <Stat label="CAGR" value={pct(data.kpis?.cagr ?? null)} color={signColor(data.kpis?.cagr ?? null)} />
            <Stat label="Max Drawdown" value={pct(data.kpis?.maxDrawdown ?? null)} color={signColor(data.kpis?.maxDrawdown ?? null)} />
            <Stat label="Volatility" value={pct(data.kpis?.volatility ?? null)} sub="annualized" />
            <Stat label="Sharpe" value={ratio(data.kpis?.sharpe ?? null)} />
            <Stat label="Sortino" value={ratio(data.kpis?.sortino ?? null)} />
            <Stat label="Calmar" value={ratio(data.kpis?.calmar ?? null)} />
            <Stat label="Beta (SPY)" value={ratio(data.kpis?.beta ?? null)} />
            <Stat label="Alpha" value={pct(data.kpis?.alpha ?? null)} color={signColor(data.kpis?.alpha ?? null)} sub="annualized" />
            <Stat label="Info Ratio" value={ratio(data.kpis?.informationRatio ?? null)} />
            <Stat label="Treynor" value={ratio(data.kpis?.treynor ?? null)} />
          </Grid>

          <Card
            title={
              <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span>NAV vs SPY · base 100</span>
                <span style={{ color: "#f0883e", fontSize: 12 }}>— NAV</span>
                <span style={{ color: "#8a97ab", fontSize: 12 }}>— SPY</span>
              </span>
            }
          >
            <NavChartLazy points={data.points} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              {data.points.length} trading days · ratio metrics need ≥63 days of history; shown as "—" when insufficient.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
