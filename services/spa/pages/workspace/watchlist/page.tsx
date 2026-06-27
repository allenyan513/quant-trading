"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/lib/next-navigation";
import { Plus } from "lucide-react";
import { LiveTable, useLive } from "@/components/live";
import { useQuotes } from "@/components/quotes";
import { apiAction } from "@/lib/api-client";
import { refresh } from "./api";
import { columns, ColumnsMenu, DEFAULT_VISIBLE, COLS_KEY, type WatchRow, type WL } from "./columns";
import { DecisionPanel } from "@/components/symbol/decision-panel";

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
      if (!(await apiAction("/api/watchlist", "POST", { symbol }))) return;
      // If a group tab is active, drop the new symbol straight into it.
      if (activeList !== "all") await apiAction("/api/watchlist/assign", "POST", { symbol, listId: activeList });
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

// The overview is a heavy multi-join of valuation / fundamentals / analyst data
// that changes ~daily, so it polls slowly; live price freshness comes from the
// lightweight market-hours quote poll, overlaid client-side (see `overlay` below).
// Groups (tabs) change only on explicit user action (which calls refresh()).
const OVERVIEW_REFRESH_MS = 30_000;
const LISTS_REFRESH_MS = 60_000;

export default function WatchlistPage() {
  const router = useRouter();
  const { data: lists } = useLive<WL[]>("/api/watchlist/lists", { refreshMs: LISTS_REFRESH_MS });
  // Reads the same SWR cache LiveTable fills (deduped) just to know which symbols
  // are shown, then ticks their live quotes during market hours.
  const { data: rows } = useLive<WatchRow[]>("/api/watchlist", { refreshMs: OVERVIEW_REFRESH_MS });
  const syms = useMemo(() => [...new Set((rows ?? []).map((r) => r.symbol))], [rows]);
  const quotes = useQuotes(syms);
  // Overlay the live quote onto each row so price + day change tick at the quote
  // cadence (15s, market-hours-gated) without re-polling the heavy overview. Off
  // hours the map is empty → rows keep their daily-close price untouched.
  const overlay = useMemo(
    () => (rs: WatchRow[]) =>
      quotes.size === 0
        ? rs
        : rs.map((r) => {
            const q = quotes.get(r.symbol);
            return q ? { ...r, price: q.price, changePct: q.changePct ?? r.changePct } : r;
          }),
    [quotes],
  );
  const [activeList, setActiveList] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
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
    if (await apiAction("/api/watchlist/lists", "POST", { name })) await refresh();
  }
  async function renameList(id: string, current: string) {
    const name = window.prompt("Rename list", current)?.trim();
    if (!name || name === current) return;
    if (await apiAction(`/api/watchlist/lists/${id}`, "PATCH", { name })) await refresh();
  }
  async function deleteList(id: string) {
    if (!window.confirm("Delete this list? Its symbols return to All.")) return;
    if (await apiAction(`/api/watchlist/lists/${id}`, "DELETE")) {
      setActiveList("all");
      await refresh();
    }
  }

  // Drag-and-drop: drag a row onto a tab to (re)group it; drag a tab to reorder.
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  async function assignSymbolToList(symbol: string, listId: string | null) {
    if (await apiAction("/api/watchlist/assign", "POST", { symbol, listId })) await refresh();
  }
  async function reorderTabs(draggedId: string, targetId: string) {
    const ids = (lists ?? []).map((l) => l.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    if (await apiAction("/api/watchlist/lists/reorder", "POST", { ids })) await refresh();
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
    <div className="portfolio-workbench">
      <div style={{ minWidth: 0, paddingRight: 14 }}>
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
        storageKey="watchlist"
        refreshMs={OVERVIEW_REFRESH_MS}
        overlay={overlay}
        rowKey={(r: WatchRow) => r.symbol}
        columns={shownColumns}
        rowFilter={activeList === "all" ? undefined : (r) => r.listId === activeList}
        getRowDragData={(r) => r.symbol}
        onRowClick={(r) => setSelected(r.symbol)}
        selectedKey={selected ?? undefined}
        onRowDoubleClick={(r) => router.push(`/workspace/data/symbol/${r.symbol}/chart`)}
        emptyText={activeList === "all" ? "Watchlist is empty — add one below." : "No symbols in this list yet — drag a row here or set its List."}
      />
      <BottomAdd activeList={activeList} />
      </div>
      <aside className="portfolio-rail">
        {selected ? (
          <DecisionPanel symbol={selected} />
        ) : (
          <div style={{ padding: 16, color: "var(--muted)", fontSize: 13, borderLeft: "1px solid var(--border)" }}>Select a symbol to see its detail.</div>
        )}
      </aside>
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
