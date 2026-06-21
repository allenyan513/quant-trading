"use client";

/**
 * Earnings detail drawer (Discover grid). A right slide-over for one company's
 * upcoming/just-reported earnings: estimate vs actual + surprise, past beat/miss
 * streak (FMP via data), a deep link to the original SEC earnings 8-K (Item 2.02),
 * a link to the on-site research page, and one-click add-to-watchlist. Transient —
 * fetches on open (no polling).
 */
import { useEffect, useState } from "react";
import { formatLargeNumber, fmtPct } from "@/lib/format";
import type { EarningsCalEntry } from "@qt/shared/earnings-read";
import type { EarningsHistRow } from "@qt/shared/markets";

const GREEN = "#3fb950";
const RED = "#f85149";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    const j = await res.json();
    return j?.ok ? (j.data as T) : null;
  } catch {
    return null;
  }
}

function Avatar({ entry, size = 40 }: { entry: EarningsCalEntry; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (entry.logoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.logoUrl} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ borderRadius: 8, background: "#fff", objectFit: "contain", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>
      {entry.symbol.slice(0, 1)}
    </div>
  );
}

/** est vs actual cell with surprise/beat coloring. */
function EstActual({ label, est, act, money, surprisePct }: { label: string; est: number | null; act: number | null; money?: boolean; surprisePct?: number | null }) {
  const fmt = (v: number | null) => (v == null ? "—" : money ? formatLargeNumber(v) : v.toFixed(2));
  const beat = act != null && est != null ? act >= est : null;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Est</span>
        <span>{fmt(est)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
        <span style={{ color: "var(--muted)" }}>Actual</span>
        <span style={{ color: beat == null ? "var(--fg)" : beat ? GREEN : RED }}>{fmt(act)}</span>
      </div>
      {surprisePct != null && (
        <div style={{ textAlign: "right", fontSize: 12, color: surprisePct >= 0 ? GREEN : RED }}>{fmtPct(surprisePct)}</div>
      )}
    </div>
  );
}

export function EarningsDrawer({ entry, mine, onClose, onAdded }: { entry: EarningsCalEntry | null; mine: boolean; onClose: () => void; onAdded?: (symbol: string) => void }) {
  const [hist, setHist] = useState<EarningsHistRow[] | null>(null);
  const [filingUrl, setFilingUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const symbol = entry?.symbol ?? null;
  useEffect(() => {
    if (!symbol) return;
    setHist(null);
    setFilingUrl(undefined);
    setAdded(false);
    setAddErr(null);
    let alive = true;
    getJson<EarningsHistRow[]>(`/api/markets/earnings-history?symbol=${encodeURIComponent(symbol)}`).then((d) => alive && setHist(d ?? []));
    getJson<{ events: { items: { code: string }[]; filingUrl: string | null }[] }>(`/api/data/symbol/${encodeURIComponent(symbol)}/events`).then((d) => {
      if (!alive) return;
      const ev = d?.events?.find((e) => e.items?.some((i) => i.code === "2.02"));
      setFilingUrl(ev?.filingUrl ?? null);
    });
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (!entry) return null;

  const add = async () => {
    setAdding(true);
    setAddErr(null);
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: entry.symbol }) });
      const j = await res.json();
      if (j?.ok) {
        setAdded(true);
        onAdded?.(entry.symbol);
      } else {
        setAddErr(typeof j?.error === "object" ? (j.error?.message ?? "Failed") : String(j?.error ?? "Failed"));
      }
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const epsSurprise = entry.epsActual != null && entry.epsEstimated != null && entry.epsEstimated !== 0 ? ((entry.epsActual - entry.epsEstimated) / Math.abs(entry.epsEstimated)) * 100 : null;
  const linkStyle: React.CSSProperties = { display: "block", padding: "9px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--fg)", textDecoration: "none", fontSize: 13 };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 94vw)", background: "var(--bg)", borderLeft: "1px solid var(--border)", zIndex: 50, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Avatar entry={entry} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{entry.symbol}</span>
              {mine && <span style={{ fontSize: 11, color: "#d29922" }}>★ Watchlist/holding</span>}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name ?? ""}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <span>📅 {entry.reportDate}</span>
          {entry.marketCap != null && <span>Market cap {formatLargeNumber(entry.marketCap)}</span>}
          {entry.sector && <span>{entry.sector}</span>}
        </div>

        <div style={{ display: "flex", gap: 16, padding: "12px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <EstActual label="EPS" est={entry.epsEstimated} act={entry.epsActual} surprisePct={epsSurprise} />
          <EstActual label="Revenue" est={entry.revenueEstimated} act={entry.revenueActual} money />
        </div>

        <div>
          <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>Past beat/miss (last 8 quarters EPS)</div>
          {hist == null ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>
          ) : hist.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>No history.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {hist.map((h) => (
                <div key={h.date} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                  <span style={{ color: "var(--muted)", width: 88 }}>{h.date}</span>
                  <span style={{ width: 56, textAlign: "right" }}>{h.epsActual?.toFixed(2) ?? "—"}</span>
                  <span style={{ width: 50, textAlign: "right", color: "var(--muted)" }}>{h.epsEstimated?.toFixed(2) ?? "—"}</span>
                  <span style={{ width: 64, textAlign: "right", fontWeight: 600, color: h.beat == null ? "var(--muted)" : h.beat ? GREEN : RED }}>
                    {h.beat == null ? "—" : h.beat ? "Beat" : "Miss"}
                  </span>
                  <span style={{ width: 64, textAlign: "right", color: h.surprisePct == null ? "var(--muted)" : h.surprisePct >= 0 ? GREEN : RED }}>{h.surprisePct == null ? "—" : fmtPct(h.surprisePct)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
          {filingUrl ? (
            <a href={filingUrl} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, borderColor: "#1f6feb", color: "#58a6ff" }}>
              📄 View original filing — SEC 8-K earnings (Item 2.02) →
            </a>
          ) : filingUrl === null ? (
            <div style={{ ...linkStyle, color: "var(--muted)", borderStyle: "dashed" }}>No 8-K earnings filing yet (not yet released or not indexed)</div>
          ) : (
            <div style={{ ...linkStyle, color: "var(--muted)" }}>Looking up filing…</div>
          )}
          <a href={`/data/symbol/${encodeURIComponent(entry.symbol)}`} style={linkStyle}>
            🔎 Research {entry.symbol} on this site →
          </a>
          {added ? (
            <div style={{ ...linkStyle, color: GREEN, textAlign: "center", borderColor: GREEN }}>✓ Added to watchlist</div>
          ) : (
            <button onClick={add} disabled={adding} style={{ ...linkStyle, background: "none", cursor: adding ? "default" : "pointer", textAlign: "center", opacity: adding ? 0.6 : 1 }}>
              {adding ? "Adding…" : "＋ Add to watchlist"}
            </button>
          )}
          {addErr && <div style={{ color: RED, fontSize: 12 }}>{addErr}</div>}
        </div>
      </div>
    </>
  );
}
