"use client";

/**
 * Global command palette + topbar search. Renders a search-box trigger in the
 * workspace topbar; ⌘K / Ctrl+K (or click) opens an overlay to jump to any symbol
 * (autocomplete from the universe via /api/search) or nav page. Arrow keys move,
 * Enter navigates, Esc closes. The pro-terminal "search anything" entry point.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/subsystems";

interface Item {
  kind: "symbol" | "page" | "go";
  label: string;
  sub?: string;
  href: string;
}

const NAV_PAGES = NAV_SECTIONS.flatMap((s) => s.pages.map((p) => ({ label: p.label, href: p.href, section: s.label })));

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ symbol: string; name: string | null; sector: string | null }[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggles the palette; Esc closes it (global).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQ("");
    setHits([]);
  }, [open]);

  // Debounced symbol search against the universe.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.data)) setHits(json.data);
      } catch {
        /* aborted or failed — leave previous hits */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items: Item[] = useMemo(() => {
    const query = q.trim();
    const lower = query.toLowerCase();
    const symbols: Item[] = hits.map((h) => ({
      kind: "symbol",
      label: h.symbol,
      sub: h.name ?? h.sector ?? "",
      href: `/workspace/data/symbol/${h.symbol}/overall`,
    }));
    const pages: Item[] = (query ? NAV_PAGES.filter((p) => p.label.toLowerCase().includes(lower)) : NAV_PAGES)
      .slice(0, 6)
      .map((p) => ({ kind: "page", label: p.label, sub: p.section, href: p.href }));
    const list = [...symbols, ...pages];
    // Free-text ticker fallback when the query isn't an exact known symbol.
    if (query && /^[A-Za-z.]{1,6}$/.test(query) && !hits.some((h) => h.symbol.toLowerCase() === lower)) {
      list.push({
        kind: "go",
        label: `Go to ${query.toUpperCase()}`,
        sub: "symbol",
        href: `/workspace/data/symbol/${query.toUpperCase()}/overall`,
      });
    }
    return list;
  }, [q, hits]);

  const go = useCallback(
    (item?: Item) => {
      const target = item ?? items[active];
      if (!target) return;
      setOpen(false);
      router.push(target.href);
    },
    [items, active, router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={triggerStyle} aria-label="Search">
        <span style={{ color: "var(--muted)", flex: 1, textAlign: "left" }}>Search symbol or page…</span>
        <span style={kbdStyle}>⌘K</span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search a ticker (e.g. AAPL) or jump to a page…"
              style={paletteInputStyle}
            />
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {items.length === 0 && (
                <div style={emptyStyle}>{q ? "No matches" : "Type a ticker or a page name"}</div>
              )}
              {items.map((it, i) => (
                <div
                  key={`${it.kind}:${it.href}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  style={rowStyle(i === active)}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontFamily: it.kind === "symbol" ? "var(--font-geist-mono), ui-monospace, monospace" : undefined,
                    }}
                  >
                    {it.label}
                  </span>
                  {it.sub && <span style={subStyle}>{it.sub}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const triggerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  maxWidth: 420,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  cursor: "text",
};

const kbdStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  padding: "1px 6px",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: "12vh",
  zIndex: 50,
};

const panelStyle: React.CSSProperties = {
  width: "min(560px, 92vw)",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};

const paletteInputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
  padding: "14px 16px",
  fontSize: 15,
  outline: "none",
};

const rowStyle = (on: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 16px",
  fontSize: 13,
  cursor: "pointer",
  background: on ? "var(--panel-2)" : "transparent",
  borderLeft: `2px solid ${on ? "var(--accent)" : "transparent"}`,
});

const subStyle: React.CSSProperties = {
  color: "var(--muted)",
  fontSize: 12,
  marginLeft: "auto",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 280,
};

const emptyStyle: React.CSSProperties = {
  padding: "16px",
  fontSize: 13,
  color: "var(--muted)",
};
