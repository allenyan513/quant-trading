/**
 * The key-statistics rail — session numbers, range stats, and valuation multiples for
 * the in-game day, laid out as one dense block the way a broker terminal does it.
 *
 * Every multiple here is point-in-time: `computeQuote` picks the newest quarter that had
 * actually been FILED by the in-game date, so a 2021 screen shows the P/E a 2021 trader
 * would have seen. There is no forward P/E on purpose — consensus estimates carry no
 * as-of date in our feed, so a "forward" number would really be a 2026 analyst's view
 * pasted onto a 2021 screen, which is exactly the leak this game is built to avoid.
 */
import { money, fmtNum, fmtPct } from "@/lib/format";
import type { GameQuote } from "@qt/shared/game";

const UP = "#3fb950";
const DOWN = "#f85149";

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right", fontFamily: "var(--font-mono)", color: color ?? "var(--text)" }}>{value}</dd>
    </>
  );
}

export function QuotePanel({ quote, symbol, name }: { quote: GameQuote; symbol: string; name: string | null }) {
  const q = quote;
  const dir = q.changeAbs == null ? 0 : q.changeAbs;
  const dirColor = dir > 0 ? UP : dir < 0 ? DOWN : "var(--text)";

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{symbol}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: dirColor, lineHeight: 1.1 }}>{q.close.toFixed(2)}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: dirColor }}>
            {q.changeAbs == null ? "—" : `${q.changeAbs >= 0 ? "+" : "−"}${Math.abs(q.changeAbs).toFixed(2)}`} {fmtPct(q.changePct, 2)}
          </span>
        </div>
      </div>

      {/* Two label/value pairs per line, broker-terminal style: same 15 stats in half the
          height, which is what leaves the news feed below usable room. */}
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "4px 10px", margin: 0, fontSize: 11 }}>
        <Row label="High" value={q.high.toFixed(2)} color={UP} />
        <Row label="Low" value={q.low.toFixed(2)} color={DOWN} />
        <Row label="Open" value={q.open.toFixed(2)} />
        <Row label="Prev Close" value={q.prevClose?.toFixed(2) ?? "—"} />
        <Row label="Volume" value={money(q.volume, "compact")} />
        <Row label="Turnover" value={money(q.turnover, "compact")} />
        <Row label="Mkt Cap" value={money(q.marketCap, "compact")} />
        {/* A negative P/E is noise, not information — say "Loss" like a real terminal. */}
        <Row label="P/E TTM" value={q.isLoss ? "Loss" : q.peTtm != null ? fmtNum(q.peTtm) : "—"} color={q.isLoss ? DOWN : undefined} />
        <Row label="P/B" value={q.priceToBook != null ? fmtNum(q.priceToBook) : "—"} />
        <Row label="P/S TTM" value={q.psTtm != null ? fmtNum(q.psTtm) : "—"} />
        <Row label="EPS TTM" value={q.ttmEps != null ? fmtNum(q.ttmEps) : "—"} />
        <Row label="Range %" value={fmtPct(q.rangePct, 2)} />
        <Row label="Avg Price" value={fmtNum(q.avgPrice)} />
        <Row label="52wk High" value={q.week52High?.toFixed(2) ?? "—"} />
        <Row label="52wk Low" value={q.week52Low?.toFixed(2) ?? "—"} />
      </dl>
    </div>
  );
}
