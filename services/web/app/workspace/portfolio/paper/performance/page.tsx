/** Paper · Performance — NAV history + KPIs (deferred to PR-C). For now the KPI
 *  strip (cash / equity / unrealized / realized) covers the summary. */
export default function PaperPerformancePage() {
  return (
    <div style={{ color: "var(--muted)", fontSize: 13, border: "1px solid var(--border)", padding: 16 }}>
      Performance over time (NAV history vs SPY + risk KPIs) for the paper account is coming soon. For now the summary is in the KPI strip above, and live P&L is on the Positions tab.
    </div>
  );
}
