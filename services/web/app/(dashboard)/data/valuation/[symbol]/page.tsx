"use client";

/**
 * Ticker valuation detail page — high-fidelity port of value-scope's unified
 * valuation page. It reads the latest `alpha_valuation_snapshots` row for the
 * symbol (the full ValuationSummary lives in `detail` jsonb, written by alpha's
 * computeReferenceValuation) and composes the same section components.
 *
 * Differences from value-scope: data comes from our snapshot API (not the
 * RelativeData/chart pipelines); the chart, paywall, checklist/memo CTAs and
 * SEO/JSON-LD are intentionally dropped. The tier is inferred from which models
 * the engine produced rather than a separate company classification.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { formatTimestamp } from "@/lib/format";
import type { ValuationSummary } from "@/types";

import { SummarySection } from "./sections/summary-section";
import { DCFSection } from "./sections/dcf-section";
import { MultiplesSection } from "./sections/multiples-section";
import { PEGSection } from "./sections/peg-section";
import { EPVSection } from "./sections/epv-section";
import { DDMSection } from "./sections/ddm-section";
import { WACCSection } from "./sections/wacc-section";

interface Snapshot {
  snapshotId: string;
  symbol: string;
  asOf: string;
  fairValuePerShare: number | null;
  currentPrice: number | null;
  upsidePct: number | null;
  verdict: string | null;
  codeVersion: string;
  createdAt: string;
  detail: (Partial<ValuationSummary> & { source?: string; error?: string }) | null;
}

export default function ValuationPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Snapshot | null>(`/api/data/valuation/${symbol}`);

  return (
    <div className="val-page">
      <div className="mb-2">
        <a href="/data/watchlist" className="text-sm text-muted-foreground hover:text-foreground">
          ← Watchlist
        </a>
      </div>
      <h1 className="text-2xl font-bold mb-1">{symbol} · Valuation</h1>

      {error && <p className="text-red-400">Error: {String(error.message ?? error)}</p>}
      {data === null && (
        <p className="text-muted-foreground">
          暂无估值快照。运行 alpha 的 <code>POST /internal/valuation-sweep</code>
          （或 watchlist 每日巡检）后再看。
        </p>
      )}
      {data && <Body snap={data} />}
    </div>
  );
}

function Body({ snap }: { snap: Snapshot }) {
  const detail = snap.detail;

  if (detail?.source === "engine_error") {
    return (
      <p className="text-red-400">
        估值引擎报错：{detail.error ?? "unknown"}（snapshot {snap.snapshotId}）
      </p>
    );
  }
  // `price_only` / partial snapshots carry no models — the engine couldn't run
  // (premium-gated statements, no price, etc.). Nothing to render.
  if (!detail || !Array.isArray(detail.models) || detail.models.length === 0) {
    return (
      <p className="text-muted-foreground">
        该 symbol 暂无完整估值（输入数据不足：缺财报或价格）。
        {detail?.source ? `（${detail.source}）` : ""}
      </p>
    );
  }

  // Past the guards `detail` is a complete ValuationSummary.
  const summary = detail as ValuationSummary;

  // Infer tier from the models the engine actually produced: full-tier FCFF DCF
  // present → "full"; only revenue DCF → pre_profit (drives DCF/Multiples tabs).
  const hasFcff = summary.models.some((m) => m.model_type.startsWith("dcf_fcff") && m.fair_value > 0);
  const hasRevenueDcf = summary.models.some((m) => m.model_type.startsWith("revenue_dcf") && m.fair_value > 0);
  const isPreProfit = !hasFcff && hasRevenueDcf;

  return (
    <div className="space-y-12">
      <div className="text-xs text-muted-foreground">
        as of {snap.asOf} · computed {formatTimestamp(snap.createdAt)} · {snap.codeVersion}
      </div>

      <SummarySection summary={summary} computedAt={summary.computed_at} />
      <DCFSection summary={summary} isPreProfit={isPreProfit} />
      <MultiplesSection summary={summary} isPreProfit={isPreProfit} />
      <PEGSection summary={summary} />
      <EPVSection summary={summary} />
      <DDMSection summary={summary} />
      {summary.wacc && <WACCSection wacc={summary.wacc} />}

      <div className="text-xs text-muted-foreground border-t pt-6">
        <p>
          <strong>Disclaimer:</strong> 估值为模型估算，仅供研究参考，非投资建议。所有模型都依赖可能与未来表现不符的假设。
        </p>
      </div>
    </div>
  );
}
