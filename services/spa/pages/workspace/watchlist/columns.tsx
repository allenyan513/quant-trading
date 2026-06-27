"use client";

/**
 * Watchlist table column definitions + the per-row cell controls (group-assign
 * dropdown, remove button) and the column show/hide picker. Split out of page.tsx
 * to keep the page focused on the tab bar + drag wiring.
 */

import { useState } from "react";
import { Columns3 } from "lucide-react";
import { SymbolLink } from "@/components/symbol-link";
import { useLive, type Column } from "@/components/live";
import { Badge, TimeText } from "@/components/ui";
import { fmtMoney, fmtNum, fmtPct, fmtBillions } from "@/lib/format";
import { TickValue } from "@/components/tick-cell";
import { apiAction } from "@/lib/api-client";
import { refresh } from "./api";

export interface WatchRow {
  symbol: string;
  note: string | null;
  addedAt: string;
  listId: string | null;
  name: string | null;
  sector: string | null;
  industry: string | null;
  archetype: string | null;
  beta: number | null;
  marketCap: number | null;
  changePct: number | null;
  ytdPct: number | null;
  ret1y: number | null;
  pctBelow52w: number | null;
  fairValue: number | null;
  price: number | null;
  upsidePct: number | null;
  verdict: string | null;
  asOf: string | null;
  analystTarget: number | null;
  targetUpsidePct: number | null;
  analystRating: string | null;
  pe: number | null;
  pb: number | null;
  de: number | null;
  netMargin: number | null;
  divYield: number | null;
  evEbitda: number | null;
  held: boolean;
  shares: number | null;
  entryPrice: number | null;
  plPct: number | null;
}

export interface WL {
  id: string;
  name: string;
}

/** Per-row group assignment dropdown (— = ungrouped / All). */
function AssignCell({ symbol, listId }: { symbol: string; listId: string | null }) {
  const { data: lists } = useLive<WL[]>("/api/watchlist/lists");
  const [busy, setBusy] = useState(false);
  async function assign(value: string) {
    setBusy(true);
    try {
      if (await apiAction("/api/watchlist/assign", "POST", { symbol, listId: value || null })) await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <select
        value={listId ?? ""}
        disabled={busy}
        onChange={(e) => assign(e.target.value)}
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "3px 6px", fontSize: 12, maxWidth: 120 }}
      >
        <option value="">—</option>
        {(lists ?? []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </span>
  );
}

function RemoveButton({ symbol }: { symbol: string }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Remove ${symbol} from watchlist?`)) return;
    setBusy(true);
    try {
      if (await apiAction(`/api/watchlist/${encodeURIComponent(symbol)}`, "DELETE")) await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button
        disabled={busy}
        onClick={remove}
        style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, cursor: busy ? "default" : "pointer", border: "1px solid #f85149", background: "transparent", color: "#f85149", opacity: busy ? 0.5 : 1 }}
      >
        Remove
      </button>
    </span>
  );
}

const verdictColor: Record<string, string> = {
  undervalued: "#3fb950",
  fairly_valued: "#8a97ab",
  overvalued: "#f85149",
};

const dash = <span style={{ color: "var(--muted)" }}>—</span>;
const pctCell = (v: number | null) =>
  v == null ? dash : <span style={{ color: v >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(v)}</span>;
// Plain ratio (P/E, P/B, …) — uncolored; nullish → dash.
const numCell = (v: number | null, digits = 1) => (v == null ? dash : <span>{v.toFixed(digits)}</span>);
// Uncolored percent (dividend yield, margin) where direction isn't good/bad.
const pctPlain = (v: number | null, digits = 2) => (v == null ? dash : <span>{v.toFixed(digits)}%</span>);

function ratingColor(g: string): string {
  const s = g.toLowerCase();
  if (/(buy|outperform|overweight|accumulate|positive|strong)/.test(s)) return "#3fb950";
  if (/(sell|underperform|underweight|reduce|negative)/.test(s)) return "#f85149";
  return "#8a97ab";
}

export const columns: Column<WatchRow>[] = [
  {
    key: "symbol",
    header: "Symbol",
    sort: (r) => r.symbol,
    render: (r) => <SymbolLink symbol={r.symbol} />,
    width: 90,
  },
  { key: "name", header: "Name", sort: (r) => r.name, render: (r) => <span style={{ fontSize: 12 }}>{r.name ?? "—"}</span>, width: 170 },
  { key: "sector", header: "Sector", sort: (r) => r.sector, render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.sector ?? "—"}</span> },
  { key: "industry", header: "Industry", sort: (r) => r.industry, render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.industry ?? "—"}</span> },
  { key: "archetype", header: "Type", sort: (r) => r.archetype, render: (r) => (r.archetype ? <Badge>{r.archetype}</Badge> : dash), width: 110 },
  { key: "marketCap", header: "Mkt cap", sort: (r) => r.marketCap, render: (r) => (r.marketCap == null ? dash : fmtBillions(r.marketCap)), width: 90 },
  // Price without a `$` prefix — the column header already says Price (fmtNum = fmtMoney sans `$`).
  { key: "price", header: "Price", sort: (r) => r.price, render: (r) => <TickValue value={r.price} dayChangePct={r.changePct} format={fmtNum} />, width: 90 },
  { key: "changePct", header: "Change %", sort: (r) => r.changePct, render: (r) => pctCell(r.changePct), width: 90 },
  { key: "ytdPct", header: "YTD %", sort: (r) => r.ytdPct, render: (r) => pctCell(r.ytdPct), width: 80 },
  { key: "ret1y", header: "1Y %", sort: (r) => r.ret1y, render: (r) => pctCell(r.ret1y), width: 80 },
  { key: "pctBelow52w", header: "vs 52w high", sort: (r) => r.pctBelow52w, render: (r) => pctCell(r.pctBelow52w), width: 100 },
  { key: "fairValue", header: "Fair value", sort: (r) => r.fairValue, render: (r) => fmtMoney(r.fairValue) },
  { key: "upsidePct", header: "Upside", sort: (r) => r.upsidePct, render: (r) => pctCell(r.upsidePct), width: 90 },
  {
    key: "verdict",
    header: "Verdict",
    sort: (r) => r.verdict,
    render: (r) => (r.verdict ? <Badge color={verdictColor[r.verdict] ?? "#8a97ab"}>{r.verdict}</Badge> : <span style={{ color: "var(--muted)" }}>no valuation</span>),
  },
  { key: "asOf", header: "Val date", sort: (r) => r.asOf, render: (r) => (r.asOf ? <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.asOf}</span> : dash), width: 100 },
  { key: "target", header: "Target", sort: (r) => r.analystTarget, render: (r) => fmtMoney(r.analystTarget), width: 90 },
  { key: "targetUpside", header: "Target ▲", sort: (r) => r.targetUpsidePct, render: (r) => pctCell(r.targetUpsidePct), width: 90 },
  { key: "rating", header: "Rating", sort: (r) => r.analystRating, render: (r) => (r.analystRating ? <Badge color={ratingColor(r.analystRating)}>{r.analystRating}</Badge> : dash), width: 110 },
  { key: "pe", header: "P/E", sort: (r) => r.pe, render: (r) => numCell(r.pe), width: 70 },
  { key: "pb", header: "P/B", sort: (r) => r.pb, render: (r) => numCell(r.pb), width: 70 },
  { key: "evEbitda", header: "EV/EBITDA", sort: (r) => r.evEbitda, render: (r) => numCell(r.evEbitda), width: 90 },
  { key: "divYield", header: "Div yield", sort: (r) => r.divYield, render: (r) => pctPlain(r.divYield), width: 80 },
  { key: "netMargin", header: "Net margin", sort: (r) => r.netMargin, render: (r) => pctPlain(r.netMargin, 1), width: 90 },
  { key: "de", header: "D/E", sort: (r) => r.de, render: (r) => numCell(r.de, 2), width: 70 },
  { key: "beta", header: "Beta", sort: (r) => r.beta, render: (r) => (r.beta == null ? dash : r.beta.toFixed(2)), width: 70 },
  {
    key: "held",
    header: "Position",
    sort: (r) => (r.held ? 1 : 0),
    render: (r) => (r.held ? <Badge color="#58a6ff">held · {r.shares ?? "?"}</Badge> : dash),
  },
  { key: "plPct", header: "P/L %", sort: (r) => r.plPct, render: (r) => pctCell(r.plPct), width: 80 },
  { key: "note", header: "Note", render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.note ?? "—"}</span> },
  { key: "addedAt", header: "Added", sort: (r) => r.addedAt, render: (r) => <TimeText ts={r.addedAt} />, width: 120 },
  { key: "list", header: "List", render: (r) => <AssignCell symbol={r.symbol} listId={r.listId} />, width: 130 },
  { key: "actions", header: "", render: (r) => <RemoveButton symbol={r.symbol} />, width: 70 },
];

// Column show/hide — Symbol + Remove are always shown; the rest toggle here,
// grouped IBKR-style. Persisted per-browser in localStorage (no per-user prefs table yet).
const COL_GROUPS = ["Identity", "Price", "Valuation", "Analysts", "Fundamentals", "Position", "Meta"];
const TOGGLEABLE: { key: string; label: string; group: string }[] = [
  { key: "name", label: "Name", group: "Identity" },
  { key: "sector", label: "Sector", group: "Identity" },
  { key: "industry", label: "Industry", group: "Identity" },
  { key: "archetype", label: "Type", group: "Identity" },
  { key: "marketCap", label: "Mkt cap", group: "Identity" },
  { key: "price", label: "Price", group: "Price" },
  { key: "changePct", label: "Change %", group: "Price" },
  { key: "ytdPct", label: "YTD %", group: "Price" },
  { key: "ret1y", label: "1Y %", group: "Price" },
  { key: "pctBelow52w", label: "vs 52w high", group: "Price" },
  { key: "beta", label: "Beta", group: "Price" },
  { key: "fairValue", label: "Fair value", group: "Valuation" },
  { key: "upsidePct", label: "Upside", group: "Valuation" },
  { key: "verdict", label: "Verdict", group: "Valuation" },
  { key: "asOf", label: "Val date", group: "Valuation" },
  { key: "target", label: "Target", group: "Analysts" },
  { key: "targetUpside", label: "Target upside", group: "Analysts" },
  { key: "rating", label: "Rating", group: "Analysts" },
  { key: "pe", label: "P/E", group: "Fundamentals" },
  { key: "pb", label: "P/B", group: "Fundamentals" },
  { key: "evEbitda", label: "EV/EBITDA", group: "Fundamentals" },
  { key: "divYield", label: "Div yield", group: "Fundamentals" },
  { key: "netMargin", label: "Net margin", group: "Fundamentals" },
  { key: "de", label: "Debt/Equity", group: "Fundamentals" },
  { key: "held", label: "Position", group: "Position" },
  { key: "plPct", label: "P/L %", group: "Position" },
  { key: "note", label: "Note", group: "Meta" },
  { key: "addedAt", label: "Added", group: "Meta" },
  { key: "list", label: "List", group: "Meta" },
];
export const DEFAULT_VISIBLE = ["marketCap", "price", "changePct", "fairValue", "upsidePct", "verdict", "pe", "divYield", "held", "list"];
export const COLS_KEY = "watchlist:columns";

export function ColumnsMenu({ visible, onToggle }: { visible: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Show / hide columns" style={colsBtn}>
        <Columns3 size={15} strokeWidth={1.75} /> Columns
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={colsPanel}>
            {COL_GROUPS.map((g) => (
              <div key={g} style={{ marginBottom: 4 }}>
                <div style={colsGroupLabel}>{g}</div>
                {TOGGLEABLE.filter((c) => c.group === g).map((c) => (
                  <label key={c.key} style={colsRow}>
                    <input type="checkbox" checked={visible.has(c.key)} onChange={() => onToggle(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const colsBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--muted)",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const colsPanel: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 4px)",
  zIndex: 31,
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
  padding: 8,
  minWidth: 180,
  maxHeight: "min(70vh, 460px)",
  overflowY: "auto",
};

const colsGroupLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: "6px 8px 2px",
};

const colsRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  fontSize: 13,
  color: "var(--text)",
  cursor: "pointer",
  borderRadius: 6,
};
