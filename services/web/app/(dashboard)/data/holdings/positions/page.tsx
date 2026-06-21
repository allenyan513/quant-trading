"use client";

/**
 * Holdings · Positions — the latest snapshot from data_holdings_positions
 * (longs → shorts → cash, by weight). Reads /api/holdings/positions, which returns
 * one snapshot ({ asOf, positions }), so this renders its own table rather than
 * the paginated LiveTable.
 */

import Link from "next/link";
import { useLive } from "@/components/live";
import { Badge, Card } from "@/components/ui";
import { fmtMoney, fmtNum } from "@/lib/format";

interface HoldingsPosition {
  symbol: string;
  assetClass: string;
  optionType: string;
  strike: number;
  expiry: string;
  quantity: number;
  avgPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
  weightPct: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

interface PositionsResponse {
  asOf: string | null;
  positions: HoldingsPosition[];
}

/** "AAPL" or "NVDA P100 26-04-17" for options. */
function label(p: HoldingsPosition): string {
  if (p.assetClass !== "OPT") return p.symbol;
  const t = p.optionType === "CALL" ? "C" : p.optionType === "PUT" ? "P" : "";
  return `${p.symbol} ${t}${fmtNum(p.strike, 0)} ${p.expiry}`;
}

function weight(p: HoldingsPosition): string {
  return p.weightPct == null ? "—" : `${p.weightPct.toFixed(1)}%`;
}

const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, whiteSpace: "nowrap" };
const th: React.CSSProperties = { ...td, color: "var(--muted)", fontSize: 12, textAlign: "left" };

export default function HoldingsPositionsPage() {
  const { data, error } = useLive<PositionsResponse>("/api/holdings/positions");
  const rows = data?.positions ?? [];

  return (
    <div>
      {data?.asOf && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Snapshot {data.asOf}</div>
      )}

      {error && <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>}
      {!data && !error && <p style={{ color: "var(--muted)" }}>Loading…</p>}

      {data && rows.length === 0 && (
        <Card>
          <p style={{ color: "var(--muted)", margin: 0 }}>No holdings snapshot yet. Connect IBKR in Settings, then click "Refresh now".</p>
        </Card>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table>
            <thead>
              <tr>
                <th style={th}>Symbol</th>
                <th style={th}>Class</th>
                <th style={th}>Qty</th>
                <th style={th}>Avg</th>
                <th style={th}>Mark</th>
                <th style={th}>Value</th>
                <th style={th}>Weight</th>
                <th style={th}>Δ</th>
                <th style={th}>Γ</th>
                <th style={th}>Θ</th>
                <th style={th}>V</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={`${p.symbol}|${p.optionType}|${p.strike}|${p.expiry}|${i}`}>
                  <td style={td}>
                    {p.assetClass === "CASH" ? (
                      <Badge>CASH</Badge>
                    ) : (
                      <Link href={`/data/symbol/${p.symbol}/overall`}>
                        <Badge>{label(p)}</Badge>
                      </Link>
                    )}
                  </td>
                  <td style={td}>{p.assetClass}</td>
                  <td style={td}>{fmtNum(p.quantity, 0)}</td>
                  <td style={td}>{fmtMoney(p.avgPrice)}</td>
                  <td style={td}>{fmtMoney(p.markPrice)}</td>
                  <td style={{ ...td, color: (p.positionValue ?? 0) < 0 ? "#f85149" : undefined }}>{fmtMoney(p.positionValue)}</td>
                  <td style={td}>{weight(p)}</td>
                  <td style={td}>{p.delta == null ? "—" : fmtNum(p.delta, 2)}</td>
                  <td style={td}>{p.gamma == null ? "—" : fmtNum(p.gamma, 3)}</td>
                  <td style={td}>{p.theta == null ? "—" : fmtNum(p.theta, 2)}</td>
                  <td style={td}>{p.vega == null ? "—" : fmtNum(p.vega, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
