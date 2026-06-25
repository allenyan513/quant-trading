"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Plus, Columns3 } from "lucide-react";
import { LiveTable, type Column } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge, TimeText } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

const refresh = () => mutate((k) => typeof k === "string" && k.startsWith("/api/watchlist"));

interface WatchRow {
  symbol: string;
  note: string | null;
  addedAt: string;
  sector: string | null;
  beta: number | null;
  changePct: number | null;
  ytdPct: number | null;
  fairValue: number | null;
  price: number | null;
  upsidePct: number | null;
  verdict: string | null;
  held: boolean;
  shares: number | null;
  entryPrice: number | null;
}

/** Bottom control: a "+" that reveals an inline input to add a symbol (IBKR-style). */
function BottomAdd() {
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

const columns: Column<WatchRow>[] = [
  {
    key: "symbol",
    header: "Symbol",
    sort: (r) => r.symbol,
    render: (r) => (
      <Link href={`/workspace/data/symbol/${r.symbol}/overall`} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
        <Badge>{r.symbol}</Badge>
      </Link>
    ),
    width: 90,
  },
  { key: "sector", header: "Sector", sort: (r) => r.sector, render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.sector ?? "—"}</span> },
  { key: "price", header: "Price", sort: (r) => r.price, render: (r) => fmtMoney(r.price) },
  {
    key: "changePct",
    header: "Change %",
    sort: (r) => r.changePct,
    render: (r) =>
      r.changePct == null ? (
        <span style={{ color: "var(--muted)" }}>—</span>
      ) : (
        <span style={{ color: r.changePct >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(r.changePct)}</span>
      ),
    width: 90,
  },
  {
    key: "ytdPct",
    header: "YTD %",
    sort: (r) => r.ytdPct,
    render: (r) =>
      r.ytdPct == null ? (
        <span style={{ color: "var(--muted)" }}>—</span>
      ) : (
        <span style={{ color: r.ytdPct >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(r.ytdPct)}</span>
      ),
    width: 80,
  },
  { key: "fairValue", header: "Fair value", sort: (r) => r.fairValue, render: (r) => fmtMoney(r.fairValue) },
  {
    key: "upsidePct",
    header: "Upside",
    sort: (r) => r.upsidePct,
    render: (r) =>
      r.upsidePct == null ? (
        <span style={{ color: "var(--muted)" }}>—</span>
      ) : (
        <span style={{ color: r.upsidePct >= 0 ? "#3fb950" : "#f85149", fontWeight: 600 }}>{fmtPct(r.upsidePct)}</span>
      ),
    width: 90,
  },
  {
    key: "verdict",
    header: "Verdict",
    sort: (r) => r.verdict,
    render: (r) => (r.verdict ? <Badge color={verdictColor[r.verdict] ?? "#8a97ab"}>{r.verdict}</Badge> : <span style={{ color: "var(--muted)" }}>no valuation</span>),
  },
  {
    key: "held",
    header: "Position",
    sort: (r) => (r.held ? 1 : 0),
    render: (r) =>
      r.held ? <Badge color="#58a6ff">held · {r.shares ?? "?"}</Badge> : <span style={{ color: "var(--muted)" }}>—</span>,
  },
  { key: "beta", header: "Beta", sort: (r) => r.beta, render: (r) => (r.beta == null ? <span style={{ color: "var(--muted)" }}>—</span> : r.beta.toFixed(2)), width: 70 },
  { key: "note", header: "Note", render: (r) => <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.note ?? "—"}</span> },
  { key: "addedAt", header: "Added", sort: (r) => new Date(r.addedAt).getTime(), render: (r) => <TimeText ts={r.addedAt} />, width: 120 },
  { key: "actions", header: "", render: (r) => <RemoveButton symbol={r.symbol} />, width: 70 },
];

// Column show/hide — Symbol + Remove are always shown; the rest toggle here.
// Persisted per-browser in localStorage (no per-user prefs table yet).
const TOGGLEABLE: { key: string; label: string }[] = [
  { key: "sector", label: "Sector" },
  { key: "price", label: "Price" },
  { key: "changePct", label: "Change %" },
  { key: "ytdPct", label: "YTD %" },
  { key: "fairValue", label: "Fair value" },
  { key: "upsidePct", label: "Upside" },
  { key: "verdict", label: "Verdict" },
  { key: "held", label: "Position" },
  { key: "beta", label: "Beta" },
  { key: "note", label: "Note" },
  { key: "addedAt", label: "Added" },
];
const DEFAULT_VISIBLE = ["price", "changePct", "fairValue", "upsidePct", "verdict", "held", "beta"];
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
            {TOGGLEABLE.map((c) => (
              <label key={c.key} style={colsRow}>
                <input type="checkbox" checked={visible.has(c.key)} onChange={() => onToggle(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
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
    setVisible((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(COLS_KEY, JSON.stringify([...next]));
      return next;
    });
  }
  const shownColumns = columns.filter((c) => c.key === "symbol" || c.key === "actions" || visible.has(c.key));

  return (
    <div>
      <PageTitle subsystem="data" sub="Your private watchlist · valuation gap / buy zone (fair value vs price) · whether held">
        Watchlist
      </PageTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 12px" }}>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
          Sorted by upside (most undervalued first). Click a header to sort; double-click a row to open.
        </p>
        <ColumnsMenu visible={visible} onToggle={toggle} />
      </div>
      <LiveTable
        path="/api/watchlist"
        rowKey={(r: WatchRow) => r.symbol}
        columns={shownColumns}
        onRowDoubleClick={(r) => router.push(`/workspace/data/symbol/${r.symbol}/overall`)}
        emptyText="Watchlist is empty — add one below, or click “Add to watchlist” on a symbol page."
      />
      <BottomAdd />
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
  minWidth: 160,
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
