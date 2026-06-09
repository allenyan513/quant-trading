"use client";

/**
 * Per-symbol News tab — a compact, read-only feed for one ticker. Reuses the
 * generic /api/news?symbol= endpoint (listNews already filters by symbol and
 * orders newest-first). No pull/notify actions here — that admin flow lives on
 * the /data/news page. The triage priority badge mirrors that page's coloring.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Badge, TimeText } from "@/components/ui";

interface NewsRow {
  id: string;
  title: string | null;
  url: string | null;
  site: string | null;
  publishedAt: string | null;
  screenPassed: boolean | null;
  screenFailedRule: string | null;
  triageMaterial: boolean | null;
  triagePriority: string | null;
  triageRationale: string | null;
  triagedAt: string | null;
}

const prioColor: Record<string, string> = { high: "#f85149", med: "#d29922", low: "#58a6ff" };
const NEUTRAL = "#8a97ab";
const FAINT = "#6e7681";

/** One human-readable triage chip {text,color,tip} — same six states as the
 * admin news page (actionable High/Med/Low colored, ignore states gray). */
function triageChip(r: NewsRow): { text: string; color: string; tip?: string } {
  if (!r.triagedAt) return { text: "Pending", color: NEUTRAL };
  if (r.screenPassed === false) return { text: "Filtered", color: FAINT, tip: r.screenFailedRule ?? undefined };
  if (r.triageMaterial === false) return { text: "Noise", color: NEUTRAL, tip: r.triageRationale ?? undefined };
  const p = r.triagePriority ?? "";
  const word = p === "high" ? "High" : p === "med" ? "Med" : p === "low" ? "Low" : p || "—";
  return { text: word, color: prioColor[p] ?? NEUTRAL, tip: r.triageRationale ?? undefined };
}

export default function NewsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<NewsRow[]>(`/api/news?symbol=${symbol}&limit=100`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {error && <div style={{ color: "#f85149", padding: 12 }}>Error: {String(error.message ?? error)}</div>}
      {data && data.length === 0 && <div style={{ color: "var(--muted)", padding: 16 }}>No news for {symbol}.</div>}
      {data?.map((r) => {
        const chip = triageChip(r);
        return (
          <div
            key={r.id}
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                    {r.title ?? r.url}
                  </a>
                ) : (
                  (r.title ?? "—")
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                {r.site ?? "—"} · <TimeText ts={r.publishedAt} />
              </div>
            </div>
            <span title={chip.tip ?? ""} style={{ flexShrink: 0 }}>
              <Badge color={chip.color}>{chip.text}</Badge>
            </span>
          </div>
        );
      })}
    </div>
  );
}
