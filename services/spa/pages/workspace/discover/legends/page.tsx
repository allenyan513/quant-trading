"use client";

import Link from "@/components/link";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtQuarter, fmtDay } from "@/lib/format";

interface Filer {
  cik: string;
  label: string | null;
  name: string;
  latestQuarter: string | null;
  filedAt: string | null;
  positions: number;
  totalValue: number;
}

const GRID = "minmax(180px, 1fr) 88px 124px 84px 180px";

/**
 * Legends 13F — the tracked roster of well-known managers as a list, each row a
 * snapshot of their most recent filed quarter. Converted from web's server component
 * to a client fetch (`GET /api/legends`).
 */
export default function LegendsPage() {
  const { data: filers } = useLive<Filer[]>("/api/legends");
  const rows = filers ?? [];

  const cell: React.CSSProperties = { padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center" };
  const head: React.CSSProperties = { ...cell, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" };

  return (
    <div>
      <style>{`.legend-row:hover{background:var(--panel-2)}`}</style>
      <PageTitle sub="Legendary investors' 13F quarterly holdings — parsed from SEC EDGAR">Legends 13F</PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Quarterly holdings parsed from SEC 13F filings, newest filing first. 13F lands ~45 days after quarter end.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No filers yet.</p>
      ) : (
        <div className="x-scroll" style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ minWidth: 656 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--border)" }}>
            <div style={head}>Manager</div>
            <div style={head}>Quarter</div>
            <div style={head}>Filed</div>
            <div style={{ ...head, justifyContent: "flex-end" }}>Positions</div>
            <div style={{ ...head, justifyContent: "flex-end" }}>Value</div>
          </div>
          {rows.map((f, i) => (
            <Link
              key={f.cik}
              href={`/workspace/discover/legends/${f.cik}`}
              className="legend-row"
              style={{ display: "grid", gridTemplateColumns: GRID, color: "var(--text)", borderTop: i === 0 ? undefined : "1px solid var(--border)" }}
            >
              <div style={{ ...cell, gap: 8, minWidth: 0 }}>
                {f.label && <Badge>{f.label}</Badge>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              </div>
              <div style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>{f.latestQuarter ? fmtQuarter(f.latestQuarter) : "no filing"}</div>
              <div style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDay(f.filedAt)}</div>
              <div style={{ ...cell, justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>{f.latestQuarter ? f.positions.toLocaleString() : "—"}</div>
              <div style={{ ...cell, justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>{f.latestQuarter ? fmtMoney(f.totalValue) : "—"}</div>
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
