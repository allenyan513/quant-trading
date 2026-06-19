"use client";

/**
 * Discover → 市场榜单: live top gainers / losers / most-active (FMP, forwarded by
 * data). A single-object snapshot (3 lists), so it uses useLive + hand-rendered
 * tables rather than LiveTable (which wants an array).
 */
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Card } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import type { MoverRow, MoversResult } from "@qt/shared/markets";

const GREEN = "#3fb950";
const RED = "#f85149";
const pct = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);

function MoverList({ rows }: { rows: MoverRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r, i) => (
        <div
          key={`${r.symbol}-${i}`}
          style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
        >
          <span style={{ color: "var(--muted)", width: 18, flexShrink: 0 }}>{i + 1}</span>
          <span style={{ minWidth: 58, fontWeight: 600, flexShrink: 0 }}>{r.symbol}</span>
          <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          <span style={{ minWidth: 64, textAlign: "right" }}>{r.price == null ? "—" : fmtMoney(r.price)}</span>
          <span style={{ minWidth: 72, textAlign: "right", fontWeight: 600, color: (r.changePct ?? 0) >= 0 ? GREEN : RED }}>{pct(r.changePct)}</span>
        </div>
      ))}
    </div>
  );
}

export default function MoversPage() {
  const { data, error } = useLive<MoversResult>("/api/markets/movers");
  return (
    <div>
      <PageTitle sub="美股当日涨幅 / 跌幅 / 成交活跃榜（FMP 实时,约 15 分钟延迟）">市场榜单</PageTitle>
      {error && <p style={{ color: RED }}>Error: {String(error.message ?? error)}</p>}
      {!data && !error && <p style={{ color: "var(--muted)" }}>Loading…</p>}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <Card title={`涨幅榜 (${data.gainers.length})`}>
            <MoverList rows={data.gainers} />
          </Card>
          <Card title={`跌幅榜 (${data.losers.length})`}>
            <MoverList rows={data.losers} />
          </Card>
          <Card title={`成交活跃 (${data.actives.length})`}>
            <MoverList rows={data.actives} />
          </Card>
        </div>
      )}
    </div>
  );
}
