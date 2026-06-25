"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Plus, Columns3 } from "lucide-react";
import { LiveTable, useLive, type Column } from "@/components/live";
import { Badge, TimeText } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

// Revalidates both the rows (/api/watchlist) and the groups (/api/watchlist/lists).
const refresh = () => mutate((k) => typeof k === "string" && k.startsWith("/api/watchlist"));

interface WatchRow {
  symbol: string;
  note: string | null;
  addedAt: string;
  listId: string | null;
  name: string | null;
  sector: string | null;
  industry: string | null;
  archetype: string | null;
  beta: number | null;
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

interface WL {
  id: string;
  name: string;
}

/** Bottom control: a "+" that reveals an inline input to add a symbol (IBKR-style).
 *  When a group tab is active, the new symbol is dropped straight into it. */
function BottomAdd({ activeList }: { activeList: string }) {
  const [open, setOpen] = useState(false);
  const [sym, setSym] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (busy) return; // guard double-submit (Enter spam while in flight)
    const symbol = sym.trim().toUpperCase();
    if (!symbol) return;
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`add failed: ${j.error ?? res.status}`);
        return;
      }
      if (activeList !== "all") {
        await fetch("/api/watchlist/assign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol, listId: activeList }),
        });
      }
      setSym("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Add a symbol" style={plusBtn}>
        <Plus size={15} strokeWidth={2} /> Add symbol
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
      <input
        autoFocus
        placeholder="Symbol (e.g. NVDA)"
        value={sym}
        onChange={(e) => setSym(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          if (!sym.trim() && !busy) setOpen(false);
        }}
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: 13, minWidth: 180 }}
      />
      <button onClick={add} disabled={busy} style={addBtn(busy)}>
        {busy ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

/** Per-row group assignment dropdown (— = ungrouped / All). */
function AssignCell({ symbol, listId }: { symbol: string; listId: string | null }) {
  const { data: lists } = useLive<WL[]>("/api/watchlist/lists");
  const [busy, setBusy] = useState(false);
  async function assign(value: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, listId: value || null }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`assign failed: ${j.error ?? res.status}`);
        return;
      }
      await refresh();
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
      const res = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(`remove failed: ${j.error ?? res.status}`);
        return;
      }
      await refresh();
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

const columns: Column<WatchRow>[] = [
  {
    key: "symbol",
    header: "Symbol",
    sort: (r) => r.symbol,
    render: (r) => (
      <Link href={`/workspace/data/symbol/${r.symbol}/overall`} draggable={false} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
        <Badge>{r.symbol}</Badge>
      </Link>
    ),
    width: 90,
  },
  { key: "name", header: "Name", sort: (r) => r.name, render: (r) => <span style={{ fontSize: 12 }}>{r.name ?? "—"}</span>, width: 170 },
  { key: "sector", header: "Sector", sort: (r) => r.sector, render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.sector ?? "—"}</span> },
  { key: "industry", header: "Industry", sort: (r) => r.industry, render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.industry ?? "—"}</span> },
  { key: "archetype", header: "Type", sort: (r) => r.archetype, render: (r) => (r.archetype ? <Badge>{r.archetype}</Badge> : dash), width: 110 },
  { key: "price", header: "Price", sort: (r) => r.price, render: (r) => fmtMoney(r.price) },
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
const DEFAULT_VISIBLE = ["price", "changePct", "fairValue", "upsidePct", "verdict", "pe", "divYield", "held", "list"];
const COLS_KEY = "watchlist:columns";

function ColumnsMenu({ visible, onToggle }: { visible: Set<string>; onToggle: (key: string) => void }) {
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

export default function WatchlistPage() {
  const router = useRouter();
  const { data: lists } = useLive<WL[]>("/api/watchlist/lists");
  const [activeList, setActiveList] = useState<string>("all");
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE));
  // Load saved column choice after mount (server + first client render use the
  // default → no hydration mismatch).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(COLS_KEY) : null;
    if (saved) {
      try {
        setVisible(new Set(JSON.parse(saved) as string[]));
      } catch {
        /* ignore malformed */
      }
    }
  }, []);
  function toggle(key: string) {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisible(next);
    localStorage.setItem(COLS_KEY, JSON.stringify([...next])); // side effect outside the state updater
  }
  const shownColumns = columns.filter((c) => c.key === "symbol" || c.key === "actions" || visible.has(c.key));

  async function newList() {
    const name = window.prompt("New list name")?.trim();
    if (!name) return;
    await fetch("/api/watchlist/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    await refresh();
  }
  async function renameList(id: string, current: string) {
    const name = window.prompt("Rename list", current)?.trim();
    if (!name || name === current) return;
    await fetch(`/api/watchlist/lists/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    await refresh();
  }
  async function deleteList(id: string) {
    if (!window.confirm("Delete this list? Its symbols return to All.")) return;
    await fetch(`/api/watchlist/lists/${id}`, { method: "DELETE" });
    setActiveList("all");
    await refresh();
  }

  // Drag-and-drop: drag a row onto a tab to (re)group it; drag a tab to reorder.
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  async function assignSymbolToList(symbol: string, listId: string | null) {
    await fetch("/api/watchlist/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, listId }) });
    await refresh();
  }
  async function reorderTabs(draggedId: string, targetId: string) {
    const ids = (lists ?? []).map((l) => l.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    await fetch("/api/watchlist/lists/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    await refresh();
  }
  // A tab accepts two drop kinds: a dragged row (→ assign its symbol; null for All)
  // or a dragged tab (→ reorder). targetId is "all" for the All tab.
  function onTabDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const symbol = e.dataTransfer.getData("symbol");
    if (symbol) {
      void assignSymbolToList(symbol, targetId === "all" ? null : targetId);
      return;
    }
    const draggedListId = e.dataTransfer.getData("listid");
    if (draggedListId && targetId !== "all") void reorderTabs(draggedListId, targetId);
  }

  return (
    <div>
      <div style={topRow}>
        <div style={tabsWrap}>
          <button
            onClick={() => setActiveList("all")}
            onDragOver={(e) => { e.preventDefault(); setDragOverId("all"); }}
            onDragLeave={() => setDragOverId((d) => (d === "all" ? null : d))}
            onDrop={(e) => onTabDrop(e, "all")}
            style={tabStyle(activeList === "all", dragOverId === "all")}
          >
            All
          </button>
          {(lists ?? []).map((l) => {
            const on = activeList === l.id;
            return (
              <button
                key={l.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("listid", l.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(l.id); }}
                onDragLeave={() => setDragOverId((d) => (d === l.id ? null : d))}
                onDrop={(e) => onTabDrop(e, l.id)}
                onDragEnd={() => setDragOverId(null)}
                onClick={() => setActiveList(l.id)}
                style={tabStyle(on, dragOverId === l.id)}
              >
                {l.name}
                {on && (
                  <>
                    <span role="button" title="Rename" onClick={(e) => { e.stopPropagation(); renameList(l.id, l.name); }} style={tabAction}>
                      ✎
                    </span>
                    <span role="button" title="Delete" onClick={(e) => { e.stopPropagation(); deleteList(l.id); }} style={tabAction}>
                      ×
                    </span>
                  </>
                )}
              </button>
            );
          })}
          <button onClick={newList} title="New list" style={{ ...tabStyle(false), padding: "5px 9px" }}>
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <ColumnsMenu visible={visible} onToggle={toggle} />
      </div>

      <LiveTable
        path="/api/watchlist"
        rowKey={(r: WatchRow) => r.symbol}
        columns={shownColumns}
        rowFilter={activeList === "all" ? undefined : (r) => r.listId === activeList}
        getRowDragData={(r) => r.symbol}
        onRowDoubleClick={(r) => router.push(`/workspace/data/symbol/${r.symbol}/overall`)}
        emptyText={activeList === "all" ? "Watchlist is empty — add one below." : "No symbols in this list yet — drag a row here or set its List."}
      />
      <BottomAdd activeList={activeList} />
    </div>
  );
}

const topRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  borderBottom: "1px solid var(--border)",
  margin: "0 0 12px",
  paddingBottom: 6,
};

const tabsWrap: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "center",
  flexWrap: "wrap",
};

const tabStyle = (active: boolean, dragOver = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 12px",
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  border: dragOver ? "1px dashed var(--accent)" : "1px solid transparent",
  color: active ? "var(--accent)" : "var(--muted)",
  background: dragOver || active ? "var(--panel-2)" : "transparent",
});

const tabAction: React.CSSProperties = { fontSize: 12, opacity: 0.7, padding: "0 2px", cursor: "pointer" };

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

const plusBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginTop: 10,
  background: "transparent",
  border: "1px dashed var(--border)",
  color: "var(--muted)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const addBtn = (busy: boolean): React.CSSProperties => ({
  background: "#1f6feb",
  border: "1px solid #388bfd",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: busy ? "default" : "pointer",
  opacity: busy ? 0.5 : 1,
});
