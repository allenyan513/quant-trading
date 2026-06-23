import Link from "next/link";
import { list13fFilers } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtQuarter, fmtDay } from "@/lib/format";

// Reads the DB per request (latest filed quarter per manager); never statically
// prerendered at build time (no DATABASE_URL then).
export const dynamic = "force-dynamic";

const GRID = "minmax(180px, 1fr) 88px 124px 84px 180px";

/**
 * Legends 13F — the tracked roster of well-known managers as a list, each row a
 * snapshot of their most recent filed quarter (position count + total reported
 * value). Click a row to drill into that manager's holdings. Read-only; data
 * owns the data_13f_* tables and the SEC sync (see #99).
 */
export default async function LegendsPage() {
  const filers = await list13fFilers();

  const cell: React.CSSProperties = { padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center" };
  const head: React.CSSProperties = {
    ...cell,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--muted)",
  };

  return (
    <div>
      <style>{`.legend-row:hover{background:var(--panel-2)}`}</style>
      <PageTitle subsystem="data" sub="Legendary investors' 13F quarterly holdings — parsed from SEC EDGAR">
        Legends 13F
      </PageTitle>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Quarterly holdings parsed from SEC 13F filings, newest filing first. Sync via{" "}
        <code>POST /13f/sync</code> (data); 13F lands ~45 days after quarter end.
      </p>

      {filers.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No filers yet — seed the roster and pull with <code>POST /13f/sync</code>.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--border)" }}>
            <div style={head}>Manager</div>
            <div style={head}>Quarter</div>
            <div style={head}>Filed</div>
            <div style={{ ...head, justifyContent: "flex-end" }}>Positions</div>
            <div style={{ ...head, justifyContent: "flex-end" }}>Value</div>
          </div>
          {filers.map((f, i) => (
            <Link
              key={f.cik}
              href={`/workspace/data/legends/${f.cik}`}
              className="legend-row"
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                textDecoration: "none",
                color: "var(--text)",
                borderTop: i === 0 ? undefined : "1px solid var(--border)",
              }}
            >
              <div style={{ ...cell, gap: 8, minWidth: 0 }}>
                {f.label && <Badge>{f.label}</Badge>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              </div>
              <div style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {f.latestQuarter ? fmtQuarter(f.latestQuarter) : "no filing"}
              </div>
              <div style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDay(f.filedAt)}</div>
              <div style={{ ...cell, justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>
                {f.latestQuarter ? f.positions.toLocaleString() : "—"}
              </div>
              <div style={{ ...cell, justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>
                {f.latestQuarter ? fmtMoney(f.totalValue) : "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
