"use client";

/**
 * Per-symbol Memo tab — the decision-time recall surface: every memo the user has
 * written that's linked to this ticker, with the PIT snapshot captured at write time.
 * Reuses the generic /api/memos?symbol= endpoint (scoped to the session user).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { PitPanel } from "@/components/memo/pit-panel";
import { MEMO_TYPE_COLOR, DIRECTION_COLOR, type MemoView } from "@/components/memo/types";

export default function SymbolMemoTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<MemoView[]>(`/api/memos?symbol=${symbol}&limit=100`);

  if (!data && !error) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>}
      {data && data.length === 0 && (
        <div style={{ color: "var(--muted)", padding: 16, border: "1px solid var(--border)", borderRadius: 10 }}>
          No memos for {symbol} yet. Write one with your Claude (submit_memo) or from the Memo tab.
        </div>
      )}
      {data?.map((m) => (
        <div key={m.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge color={MEMO_TYPE_COLOR[m.type]}>{m.type}</Badge>
            {m.direction && <Badge color={DIRECTION_COLOR[m.direction]}>{m.direction}</Badge>}
            {m.status !== "active" && <Badge color="#8a97ab">{m.status}</Badge>}
            <Link href={`/workspace/memo/${m.id}`} style={{ fontWeight: 600, color: "var(--text)" }}>
              {m.title}
            </Link>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{fmtDate(m.createdAt)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <PitPanel symbols={m.symbols.filter((s) => s.symbol === symbol)} />
          </div>
        </div>
      ))}
    </div>
  );
}
