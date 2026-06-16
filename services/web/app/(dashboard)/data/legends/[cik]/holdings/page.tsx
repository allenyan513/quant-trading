import Link from "next/link";
import { list13fHoldings, type HoldingRow } from "@/lib/queries";
import { fmtMoney, fmtQuarter } from "@/lib/format";

export const dynamic = "force-dynamic";

// Recent-activity cell: quarter-over-quarter share change, dataroma-style
// ("Add 3.46%" / "Reduce 9.78%" / "Buy"). Exited names are filtered out of the
// Holdings tab (they belong under Sells/Activity), so no "Sold All" here.
function activity(h: HoldingRow): { text: string; color: string } {
  const muted = "var(--muted)";
  if (h.change === "new") return { text: "Buy", color: "#3fb950" };
  if (h.change === "held") return { text: "—", color: muted };
  if (h.prevShares <= 0) return { text: "—", color: muted };
  const pct = Math.abs((h.shares - h.prevShares) / h.prevShares) * 100;
  return h.change === "added"
    ? { text: `Add ${pct.toFixed(2)}%`, color: "#3fb950" }
    : { text: `Reduce ${pct.toFixed(2)}%`, color: "#f85149" };
}

/**
 * Holdings tab — current-quarter positions, dataroma-style columns: Stock /
 * % of Portfolio / Recent Activity / Shares / Reported Price / Value. Reported
 * Price + % of Portfolio are derived in list13fHoldings; live-price columns
 * (Current / +- / 52wk) are a deferred Phase 2. Read-only (see #99).
 */
export default async function LegendHoldingsTab({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  const { prevQuarter, holdings } = await list13fHoldings(cik);
  // Holdings tab shows current positions only; exited names live under Sells.
  const rows = holdings.filter((h) => h.change !== "exited");

  if (rows.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No holdings synced yet.</p>;
  }

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "7px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = { padding: "7px 12px", fontSize: 13, borderBottom: "1px solid var(--border)" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      {prevQuarter && (
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 8px" }}>
          Recent activity vs {fmtQuarter(prevQuarter)}.
        </p>
      )}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Stock</th>
              <th style={thR}>% of Portfolio</th>
              <th style={th}>Recent Activity</th>
              <th style={thR}>Shares</th>
              <th style={thR}>Reported Price</th>
              <th style={thR}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const act = activity(h);
              return (
                <tr key={`${h.cusip}|${h.putCall}`}>
                  <td style={td}>
                    {h.ticker ? (
                      <Link href={`/data/symbol/${h.ticker}`} style={{ color: "#58a6ff", fontWeight: 600, textDecoration: "none" }}>
                        {h.ticker}
                      </Link>
                    ) : null}
                    <span style={{ color: h.ticker ? "var(--muted)" : "var(--text)", marginLeft: h.ticker ? 8 : 0 }}>
                      {h.issuerName}
                      {h.putCall ? ` (${h.putCall})` : ""}
                    </span>
                  </td>
                  <td style={tdR}>{(h.pctPortfolio * 100).toFixed(2)}%</td>
                  <td style={{ ...td, color: act.color, whiteSpace: "nowrap" }}>{act.text}</td>
                  <td style={tdR}>{h.shares > 0 ? Math.round(h.shares).toLocaleString() : "—"}</td>
                  <td style={tdR}>{h.reportedPrice != null ? `$${h.reportedPrice.toFixed(2)}` : "—"}</td>
                  <td style={tdR}>{h.value > 0 ? fmtMoney(h.value) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
