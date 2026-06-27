"use client";

/**
 * Dividends section (Financials tab): the symbol's dividend history — ex-date,
 * record/payment dates, amount, yield — from the read-through cache (data_dividends,
 * warmed from FMP). Hidden entirely for non-payers; prompts a warm if uncached.
 */

import { useLive } from "@/components/live";
import { fmtMoney } from "@/lib/format";

interface DivRow {
  observedAt: string;
  data: {
    date?: string;
    recordDate?: string;
    paymentDate?: string;
    dividend?: number;
    adjDividend?: number;
    yield?: number;
  };
}

export function DividendsSection({ symbol }: { symbol: string }) {
  const { data } = useLive<DivRow[]>(`/api/data/symbol/${symbol}/dividends`);
  if (data === undefined) return null; // loading — stay quiet
  if (data.length === 0) return null; // non-payer (or not warmed) — don't clutter the tab

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Dividends</div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
        <table>
          <thead>
            <tr>
              {["Ex-date", "Record", "Payment", "Amount", "Yield"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const d = r.data;
              const amt = typeof d.dividend === "number" ? d.dividend : d.adjDividend ?? null;
              return (
                <tr key={d.date ?? r.observedAt}>
                  <td style={td}>{d.date ?? "—"}</td>
                  <td style={{ ...td, color: "var(--muted)" }}>{d.recordDate || "—"}</td>
                  <td style={{ ...td, color: "var(--muted)" }}>{d.paymentDate || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtMoney(amt)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{typeof d.yield === "number" ? `${d.yield.toFixed(2)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12.5,
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
