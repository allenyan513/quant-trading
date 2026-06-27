/**
 * Point-in-time context panel — renders the price / valuation / position snapshot
 * captured when each symbol was attached to a memo. Presentational (no hooks), so it
 * renders in both the server detail page and the client symbol tab. This is the memo
 * layer's differentiator: it shows what was true WHEN the memo was written.
 */
import Link from "next/link";
import { fmtMoney, fmtPct, fmtNum, fmtDate } from "@/lib/format";
import type { MemoSymbolView } from "./types";

function posText(p: MemoSymbolView["context"]): string {
  const pos = p?.position;
  if (!pos) return "—";
  const live = pos.live && pos.live.qty ? `Live ${fmtNum(pos.live.qty, 0)} @ ${fmtMoney(pos.live.avgCost)}` : null;
  const paper = pos.paper && pos.paper.qty ? `Paper ${fmtNum(pos.paper.qty, 0)} @ ${fmtMoney(pos.paper.avgCost)}` : null;
  return [live, paper].filter(Boolean).join(" · ") || "Flat";
}

export function PitPanel({ symbols }: { symbols: MemoSymbolView[] }) {
  if (symbols.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {symbols.map((s) => {
        const ctx = s.context;
        return (
          <div key={s.symbol} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "var(--panel-2)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <Link href={`/workspace/data/symbol/${s.symbol}`} style={{ fontWeight: 700, color: "#58a6ff" }}>
                {s.symbol}
              </Link>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>at write · {fmtDate(s.priceTs ?? s.attachedAt)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 6, fontSize: 12.5 }}>
              <Field label="Price" value={fmtMoney(s.priceAtWrite)} />
              <Field label="Fair value" value={fmtMoney(ctx?.fairValue ?? null)} />
              <Field label="Upside" value={ctx?.upsidePct != null ? fmtPct(ctx.upsidePct) : "—"} color={ctx?.upsidePct != null ? (ctx.upsidePct >= 0 ? "#3fb950" : "#f85149") : undefined} />
              {ctx?.verdict && <Field label="Verdict" value={ctx.verdict} />}
              <Field label="Position" value={posText(ctx)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
      <span style={{ color: color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}
