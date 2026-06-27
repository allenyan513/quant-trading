"use client";

import { useParams } from "react-router-dom";
import Link from "@/components/link";
import { useLive } from "@/components/live";
import { fmtMoney, fmtQuarter, money } from "@/lib/format";

interface HoldingRow {
  cusip: string;
  putCall: string | null;
  ticker: string | null;
  issuerName: string;
  change: "new" | "held" | "added" | "reduced" | "exited";
  shares: number;
  prevShares: number;
  pctPortfolio: number;
  reportedPrice: number | null;
  value: number;
}
interface HoldingsResponse {
  prevQuarter: string | null;
  holdings: HoldingRow[];
}

// Recent-activity cell: quarter-over-quarter share change, dataroma-style.
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

export default function LegendHoldingsTab() {
  const { cik = "" } = useParams<{ cik: string }>();
  const { data } = useLive<HoldingsResponse>(`/api/legends/${cik}/holdings`);
  const prevQuarter = data?.prevQuarter ?? null;
  const rows = (data?.holdings ?? []).filter((h) => h.change !== "exited");

  if (data && rows.length === 0) {
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
    borderRight: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = { padding: "7px 12px", fontSize: 13, borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      {prevQuarter && <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 8px" }}>Recent activity vs {fmtQuarter(prevQuarter)}.</p>}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
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
                      <Link href={`/workspace/data/symbol/${h.ticker}`} style={{ color: "#58a6ff", fontWeight: 600 }}>
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
                  <td style={tdR}>{h.reportedPrice != null ? money(h.reportedPrice, "cell") : "—"}</td>
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
