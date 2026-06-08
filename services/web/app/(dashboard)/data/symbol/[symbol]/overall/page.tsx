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

export default function OverallTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Overview>(`/api/data/symbol/${symbol}/overview`);

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
    <Link href={`/data/symbol/${symbol}/valuation`}>
      <Card title="估值 gap" accent="#a371f7">
        {v ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="现价" value={fmtMoney(v.currentPrice)} />
            <Row label="公允价" value={fmtMoney(v.fairValuePerShare)} />
            <Row label="upside" value={<span style={{ color: up == null ? "var(--muted)" : up >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(up)}</span>} />
            <div style={{ marginTop: 2 }}><StatusBadge status={v.verdict} /></div>
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>暂无估值快照 →</span>
        )}
      </Card>
    </Link>
  );
}

function PositionCard({ p }: { p: NonNullable<Overview["positions"]> }) {
  const open = p[0];
  return (
    <Link href="/portfolio/positions">
      <Card title="持仓" accent="#f0883e">
        {open ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="状态" value={<StatusBadge status={open.status} />} />
            <Row label="股数" value={open.shares == null ? "—" : fmtNum(open.shares, 0)} />
            <Row label="成本" value={fmtMoney(open.entryPrice)} />
            <Row label="权重" value={open.targetWeight == null ? "—" : `${(open.targetWeight * 100).toFixed(1)}%`} />
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>无持仓</span>
        )}
      </Card>
    </Link>
  );
}

function NewsCard({ symbol, news }: { symbol: string; news: NonNullable<Overview["news"]> }) {
  return (
    <Link href={`/data/symbol/${symbol}/news`}>
      <Card title="最新新闻" accent="#58a6ff">
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
          <span style={{ color: "var(--muted)", fontSize: 13 }}>无新闻</span>
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
    <Link href={`/data/symbol/${symbol}/financials`}>
      <Card title="关键比率" accent="#3fb950">
        {ratios ? (
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <Row label="P/E" value={ratio(pe)} />
            <Row label="P/S" value={ratio(ps)} />
            <Row label="净利率" value={pct(nm)} />
            <Row label="ROE" value={pct(roe)} />
            <Row label="D/E" value={ratio(de)} />
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{ratios.period} · {ratios.fiscalDate}</div>
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>暂无财报缓存</span>
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
