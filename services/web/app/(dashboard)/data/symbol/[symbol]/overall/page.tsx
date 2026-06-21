"use client";

/**
 * Overall tab — the per-symbol home. A row of summary cards (valuation gap,
 * position, latest news, key ratios), each linking to its deep-dive tab, above
 * the full activity timeline (consolidated from the old /symbol/[symbol] page).
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, StatusBadge, TimeText } from "@/components/ui";
import { SymbolTimeline } from "@/components/symbol-timeline";
import { fmtMoney, fmtPct, fmtNum } from "@/lib/format";

interface Overview {
  symbol: string;
  valuation: { fairValuePerShare: number | null; currentPrice: number | null; upsidePct: number | null; verdict: string | null; createdAt: string } | null;
  positions: { signalId: string; status: string; shares: number | null; entryPrice: number | null; targetWeight: number | null }[];
  news: { externalId: string; title: string | null; site: string | null; url: string | null; publishedAt: string | null; triagePriority: string | null }[];
  ratios: { fiscalDate: string; period: string; data: Record<string, unknown> } | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Grid items default to min-width:auto, so long (nowrap) content forces the
// track wider than the viewport → cards bleed into neighbors + the page scrolls
// sideways. min-width:0 lets the track shrink; overflow:hidden clips content.
const cardLink: React.CSSProperties = { minWidth: 0, display: "block", overflow: "hidden" };

export default function OverallTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Overview>(`/api/data/symbol/${symbol}/overview`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        <ValuationCard symbol={symbol} v={data?.valuation ?? null} />
        <PositionCard p={data?.positions ?? []} />
        <NewsCard symbol={symbol} news={data?.news ?? []} />
        <RatiosCard symbol={symbol} ratios={data?.ratios ?? null} />
      </div>

      <SymbolTimeline symbol={symbol} />
    </div>
  );
}

function ValuationCard({ symbol, v }: { symbol: string; v: Overview["valuation"] }) {
  const up = v?.upsidePct ?? null;
  return (
    <Link href={`/data/symbol/${symbol}/valuation`} style={cardLink}>
      <Card title="Valuation gap" accent="#a371f7">
        {v ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="Price" value={fmtMoney(v.currentPrice)} />
            <Row label="Fair value" value={fmtMoney(v.fairValuePerShare)} />
            <Row label="Upside" value={<span style={{ color: up == null ? "var(--muted)" : up >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(up)}</span>} />
            <div style={{ marginTop: 2 }}><StatusBadge status={v.verdict} /></div>
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>No valuation snapshot yet →</span>
        )}
      </Card>
    </Link>
  );
}

function PositionCard({ p }: { p: NonNullable<Overview["positions"]> }) {
  const open = p[0];
  return (
    <Link href="/portfolio/positions" style={cardLink}>
      <Card title="Position" accent="#f0883e">
        {open ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="Status" value={<StatusBadge status={open.status} />} />
            <Row label="Shares" value={open.shares == null ? "—" : fmtNum(open.shares, 0)} />
            <Row label="Cost" value={fmtMoney(open.entryPrice)} />
            <Row label="Weight" value={open.targetWeight == null ? "—" : `${(open.targetWeight * 100).toFixed(1)}%`} />
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>No position</span>
        )}
      </Card>
    </Link>
  );
}

function NewsCard({ symbol, news }: { symbol: string; news: NonNullable<Overview["news"]> }) {
  return (
    <Link href={`/data/symbol/${symbol}/news`} style={cardLink}>
      <Card title="Latest news" accent="#58a6ff">
        {news.length ? (
          <div style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
            {news.slice(0, 4).map((n) => (
              <div key={n.externalId} style={{ lineHeight: 1.3 }}>
                <div style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title ?? "—"}</div>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>
                  {n.site ?? "—"} · <TimeText ts={n.publishedAt} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>No news</span>
        )}
      </Card>
    </Link>
  );
}

function RatiosCard({ symbol, ratios }: { symbol: string; ratios: Overview["ratios"] }) {
  const d = ratios?.data ?? {};
  const pe = num(d.priceToEarningsRatio);
  const ps = num(d.priceToSalesRatio);
  const de = num(d.debtToEquityRatio);
  const nm = num(d.netProfitMargin);
  const roe = num(d.returnOnEquity);
  const ratio = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
  return (
    <Link href={`/data/symbol/${symbol}/financials`} style={cardLink}>
      <Card title="Key ratios" accent="#3fb950">
        {ratios ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="P/E" value={ratio(pe)} />
            <Row label="P/S" value={ratio(ps)} />
            <Row label="Net margin" value={pct(nm)} />
            <Row label="ROE" value={pct(roe)} />
            <Row label="D/E" value={ratio(de)} />
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{ratios.period} · {ratios.fiscalDate}</div>
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>No financials cached yet</span>
        )}
      </Card>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
