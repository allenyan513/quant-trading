"use client";

/**
 * Events tab — the symbol's SEC 8-K material-event filings (official "current
 * reports"), newest first. Item codes (2.02 earnings, 5.02 leadership, 1.03
 * bankruptcy, …) come structured from SEC; each is badged by materiality. Distinct
 * from News (FMP articles): these are official filings. Reads getEventsData
 * (@qt/shared/edgar-8k-read), the same source fed to the MCP events section.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Card, Badge, TimeText } from "@/components/ui";

interface DecodedItem {
  code: string;
  label: string;
  category: "high" | "material" | "routine";
}
interface Event {
  accessionNumber: string;
  filedDate: string;
  reportDate: string | null;
  category: "high" | "material" | "routine";
  items: DecodedItem[];
  filingUrl: string | null;
}
interface Events {
  symbol: string;
  events: Event[];
}

// high = distress / market-moving (red); material = earnings / M&A / leadership
// (orange); routine = exhibits / Reg FD / votes (muted).
const CAT_COLOR: Record<string, string> = { high: "#f85149", material: "#f0883e", routine: "#8a97ab" };

export default function EventsTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Events>(`/api/data/symbol/${symbol}/events`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {data.events.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No 8-K material events filed in the past year.</p>
      ) : (
        <Card title={`Events · SEC 8-K (${data.events.length})`}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.events.map((e) => (
              <div
                key={e.accessionNumber}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
              >
                <span style={{ color: "var(--muted)", fontSize: 12, minWidth: 92, paddingTop: 1 }}>
                  <TimeText ts={e.reportDate ?? e.filedDate} />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {e.items.map((it) => (
                    <span key={it.code} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <Badge color={CAT_COLOR[it.category]}>{it.code}</Badge>
                      <span style={{ color: it.category === "routine" ? "var(--muted)" : "var(--text)" }}>{it.label}</span>
                    </span>
                  ))}
                </div>
                {e.filingUrl && (
                  <a href={e.filingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#58a6ff", fontSize: 12, whiteSpace: "nowrap", paddingTop: 1 }}>
                    View ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
        8-K = official SEC filing for material events (&ldquo;current report&rdquo;); item codes come straight from SEC filing metadata.
        Colored by materiality:<span style={{ color: CAT_COLOR.high }}>High</span> (bankruptcy / delisting / restatement / control)·
        <span style={{ color: CAT_COLOR.material }}> Material</span> (earnings / M&A / leadership)· Routine (exhibits / Reg FD / votes).
        Covers tracked-universe symbols only, past year.
      </p>
    </div>
  );
}
