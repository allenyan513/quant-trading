"use client";

/**
 * Discover → 财报日历: a moomoo-style calendar grid. Each day shows the top-N
 * companies reporting that day ranked by market cap (logo + EPS + beat/miss),
 * with your watchlist/holdings highlighted. Click a company for the detail drawer
 * (estimate vs actual, past beat/miss streak, the original SEC 8-K, add-to-watchlist).
 * Reads the enriched data_earnings_calendar (data owns the write; web reads directly).
 */
import { useMemo, useState } from "react";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { EarningsDrawer } from "@/components/earnings-drawer";
import { formatLargeNumber } from "@/lib/format";
import { groupTopNPerDay, type EarningsCalEntry } from "@qt/shared/earnings-read";

interface CalResp {
  rows: EarningsCalEntry[];
  mine: string[];
}

const GREEN = "#3fb950";
const RED = "#f85149";
const MINE_BG = "rgba(210,153,34,0.14)";
const WEEK_TOP_N = 10;
const MONTH_TOP_N = 4;
const WD = ["一", "二", "三", "四", "五", "六", "日"];

// ---- local-date helpers (never UTC: the DB report_date is a plain calendar date) ----
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
};
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday = 0

function Logo({ e, size }: { e: EarningsCalEntry; size: number }) {
  const [broken, setBroken] = useState(false);
  if (e.logoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={e.logoUrl} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ borderRadius: 4, background: "#fff", objectFit: "contain", flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 4, background: "var(--panel)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 700, flexShrink: 0 }}>
      {e.symbol.slice(0, 1)}
    </span>
  );
}

function beatMark(e: EarningsCalEntry): { mark: string; color: string } | null {
  if (e.epsActual == null || e.epsEstimated == null) return null;
  const beat = e.epsActual >= e.epsEstimated;
  return { mark: beat ? "▲" : "▼", color: beat ? GREEN : RED };
}

function WeekEntry({ e, mine, onClick }: { e: EarningsCalEntry; mine: boolean; onClick: () => void }) {
  const bm = beatMark(e);
  return (
    <button onClick={onClick} title={e.name ?? e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px", width: "100%", background: mine ? MINE_BG : "transparent", border: "none", borderRadius: 4, cursor: "pointer", textAlign: "left", fontSize: 12, color: "var(--fg)" }}>
      <Logo e={e} size={18} />
      <span style={{ fontWeight: 600, minWidth: 46, flexShrink: 0 }}>{e.symbol}</span>
      <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontSize: 11, textAlign: "right" }}>{e.marketCap == null ? "" : formatLargeNumber(e.marketCap)}</span>
      {bm && <span style={{ color: bm.color, fontSize: 11, width: 10 }}>{bm.mark}</span>}
    </button>
  );
}

export default function EarningsPage() {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<EarningsCalEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [extraMine, setExtraMine] = useState<Set<string>>(new Set()); // symbols added this session

  const todayIso = iso(new Date());

  // visible date range + the day cells to render
  const { from, to, days, label } = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      const ds = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
      const end = addDays(start, 6);
      const lbl = `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
      return { from: ds[0]!, to: ds[6]!, days: ds, label: lbl };
    }
    const gridStart = startOfWeek(addMonths(anchor, 0));
    const ds = Array.from({ length: 42 }, (_, i) => iso(addDays(gridStart, i)));
    return { from: ds[0]!, to: ds[41]!, days: ds, label: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月` };
  }, [view, anchor]);

  const { data, error } = useLive<CalResp>(`/api/markets/earnings?from=${from}&to=${to}`);

  const byDate = useMemo(() => {
    const m = new Map<string, EarningsCalEntry[]>();
    if (data?.rows) for (const d of groupTopNPerDay(data.rows, Number.MAX_SAFE_INTEGER)) m.set(d.date, d.top);
    return m;
  }, [data]);

  const mine = useMemo(() => {
    const s = new Set<string>(extraMine);
    for (const m of data?.mine ?? []) s.add(m.toUpperCase());
    return s;
  }, [data, extraMine]);

  const step = (dir: number) => setAnchor((a) => (view === "week" ? addDays(a, dir * 7) : addMonths(a, dir)));
  const toggleDay = (d: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  const curMonth = anchor.getMonth();

  return (
    <div>
      <PageTitle sub="按市值排序的每日重点财报；点击查看预期/实际、历史 beat/miss 与 SEC 原文。★ 为你的自选/持仓">财报日历</PageTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {(["week", "month"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "5px 14px", background: view === v ? "var(--panel)" : "transparent", color: view === v ? "var(--fg)" : "var(--muted)", border: "none", cursor: "pointer", fontSize: 13 }}>
              {v === "week" ? "周" : "月"}
            </button>
          ))}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => step(-1)} style={navBtn}>‹</button>
          <span style={{ minWidth: 150, textAlign: "center", fontWeight: 600, fontSize: 14 }}>{label}</span>
          <button onClick={() => step(1)} style={navBtn}>›</button>
        </div>
        <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 13 }}>今天</button>
        {error && <span style={{ color: RED, fontSize: 12 }}>加载失败: {String(error.message ?? error)}</span>}
      </div>

      {view === "week" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {days.map((d, i) => {
            const entries = byDate.get(d) ?? [];
            const open = expanded.has(d);
            const shown = open ? entries : entries.slice(0, WEEK_TOP_N);
            const dt = new Date(`${d}T00:00:00`);
            return (
              <div key={d} style={{ border: "1px solid var(--border)", borderRadius: 8, minHeight: 120, background: d === todayIso ? "rgba(88,166,255,0.06)" : "transparent", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <span style={{ color: "var(--muted)" }}>{WD[i]}</span> <span style={{ fontWeight: 600, color: d === todayIso ? "#58a6ff" : "var(--fg)" }}>{dt.getDate()}</span>
                  {entries.length > 0 && <span style={{ float: "right", color: "var(--muted)" }}>{entries.length}</span>}
                </div>
                <div style={{ padding: "4px 4px", display: "flex", flexDirection: "column", gap: 1 }}>
                  {entries.length === 0 ? (
                    <span style={{ color: "var(--muted)", fontSize: 11, padding: 4 }}>—</span>
                  ) : (
                    shown.map((e) => <WeekEntry key={e.symbol} e={e} mine={mine.has(e.symbol.toUpperCase())} onClick={() => setSelected(e)} />)
                  )}
                  {entries.length > WEEK_TOP_N && (
                    <button onClick={() => toggleDay(d)} style={{ background: "none", border: "none", color: "#58a6ff", fontSize: 11, cursor: "pointer", padding: "4px", textAlign: "left" }}>
                      {open ? "收起" : `+${entries.length - WEEK_TOP_N} 更多`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 6 }}>
            {WD.map((w) => (
              <div key={w} style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>{w}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {days.map((d) => {
              const entries = byDate.get(d) ?? [];
              const dt = new Date(`${d}T00:00:00`);
              const outside = dt.getMonth() !== curMonth;
              return (
                <div key={d} style={{ border: "1px solid var(--border)", borderRadius: 8, minHeight: 96, padding: "5px 6px", opacity: outside ? 0.4 : 1, background: d === todayIso ? "rgba(88,166,255,0.06)" : "transparent" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3, color: d === todayIso ? "#58a6ff" : "var(--fg)" }}>{dt.getDate()}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {entries.slice(0, MONTH_TOP_N).map((e) => (
                      <button key={e.symbol} onClick={() => setSelected(e)} title={e.name ?? e.symbol} style={{ display: "flex", alignItems: "center", gap: 4, background: mine.has(e.symbol.toUpperCase()) ? MINE_BG : "transparent", border: "none", borderRadius: 3, padding: "1px 2px", cursor: "pointer", fontSize: 11, color: "var(--fg)" }}>
                        <Logo e={e} size={14} />
                        <span style={{ fontWeight: 600 }}>{e.symbol}</span>
                      </button>
                    ))}
                    {entries.length > MONTH_TOP_N && <span style={{ color: "var(--muted)", fontSize: 10, paddingLeft: 2 }}>+{entries.length - MONTH_TOP_N}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EarningsDrawer entry={selected} mine={selected ? mine.has(selected.symbol.toUpperCase()) : false} onClose={() => setSelected(null)} onAdded={(s) => setExtraMine((p) => new Set(p).add(s.toUpperCase()))} />
    </div>
  );
}

const navBtn: React.CSSProperties = { width: 30, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--fg)", cursor: "pointer", fontSize: 16, lineHeight: 1 };
