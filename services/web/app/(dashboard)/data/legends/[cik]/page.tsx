import Link from "next/link";
import { notFound } from "next/navigation";
import { list13fHoldings } from "@/lib/queries";
import type { HoldingChange } from "@qt/shared/thirteenf";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import { formatLargeNumber, fmtQuarter } from "@/lib/format";

export const dynamic = "force-dynamic";

// Quarter-over-quarter change → colour. New money is green, exits red, the rest
// neutral-to-warm. Mirrors diffHoldings' classification (@qt/shared/thirteenf).
const CHANGE_COLOR: Record<HoldingChange, string> = {
  new: "#3fb950",
  added: "#2ea043",
  held: "#8a97ab",
  trimmed: "#d29922",
  exited: "#f85149",
};

/**
 * One manager's latest-quarter 13F holdings, each tagged with its
 * quarter-over-quarter change (new/added/held/trimmed, plus exited names carried
 * from the prior quarter). Tickers come from the self-maintained CUSIP map
 * (null = unmapped). Read-only (see #99).
 */
export default async function LegendHoldingsPage({
  params,
}: {
  params: Promise<{ cik: string }>;
}) {
  const { cik } = await params;
  const { name, quarter, prevQuarter, holdings } = await list13fHoldings(cik);
  if (!name) notFound();

  // holdings includes exited names carried from the prior quarter (value 0) —
  // count them separately so "positions" matches the current-quarter filing.
  const exited = holdings.filter((h) => h.change === "exited").length;
  const positions = holdings.length - exited;

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 10px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--muted)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderBottom: "1px solid var(--border)" };
  const numTd: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      <PageTitle subsystem="data" sub={name}>
        <Link href="/data/legends" style={{ color: "var(--muted)", textDecoration: "none" }}>
          Legends 13F
        </Link>{" "}
        / {name}
      </PageTitle>

      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        {quarter ? (
          <>
            Quarter <strong style={{ color: "var(--text)" }}>{fmtQuarter(quarter)}</strong>
            {prevQuarter ? <> · vs {fmtQuarter(prevQuarter)}</> : <> · no prior quarter to diff</>} ·{" "}
            {positions} positions{exited > 0 ? <> · {exited} exited</> : null}
          </>
        ) : (
          "No holdings synced yet."
        )}
      </p>

      {holdings.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Ticker</th>
                <th style={th}>Issuer</th>
                <th style={th}>Class</th>
                <th style={{ ...th, textAlign: "right" }}>Value</th>
                <th style={{ ...th, textAlign: "right" }}>Shares</th>
                <th style={{ ...th, textAlign: "right" }}>Prev shares</th>
                <th style={th}>Change</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={`${h.cusip}|${h.putCall}`}>
                  <td style={td}>{h.ticker ? <Badge>{h.ticker}</Badge> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td style={td}>
                    {h.issuerName}
                    {h.putCall ? <span style={{ color: "var(--muted)" }}> ({h.putCall})</span> : null}
                  </td>
                  <td style={{ ...td, color: "var(--muted)" }}>{h.titleOfClass ?? "—"}</td>
                  <td style={numTd}>{h.value > 0 ? formatLargeNumber(h.value) : "—"}</td>
                  <td style={numTd}>{h.shares > 0 ? Math.round(h.shares).toLocaleString() : "—"}</td>
                  <td style={{ ...numTd, color: "var(--muted)" }}>
                    {h.prevShares > 0 ? Math.round(h.prevShares).toLocaleString() : "—"}
                  </td>
                  <td style={td}>
                    <Badge color={CHANGE_COLOR[h.change]}>{h.change}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
