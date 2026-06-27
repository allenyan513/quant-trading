"use client";

import { useParams } from "react-router-dom";
import Link from "@/components/link";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui";
import { BriefMarkdown } from "@/components/brief-markdown";
import { PitPanel } from "@/components/memo/pit-panel";
import { MemoActions } from "@/components/memo/memo-actions";
import { MEMO_TYPE_COLOR, DIRECTION_COLOR, type MemoSymbolView } from "@/components/memo/types";
import { fmtDate } from "@/lib/format";

interface MemoDetail {
  id: string;
  type: string;
  title: string;
  markdown: string | null;
  direction: string | null;
  status: string;
  pinned: boolean;
  createdAt: string;
  symbols: unknown[];
}

export default function MemoDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: memo, error } = useLive<MemoDetail | null>(`/api/memos/${id}`);

  if (error || memo === null) {
    return (
      <div style={{ maxWidth: 820 }}>
        <Link href="/workspace/memo" style={{ color: "#58a6ff", fontSize: 13 }}>← All memos</Link>
        <div style={{ marginTop: 14, color: "var(--muted)" }}>Memo not found.</div>
      </div>
    );
  }
  if (!memo) return <div style={{ color: "var(--muted)" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 820 }}>
      <PageTitle>Memo</PageTitle>
      <Link href="/workspace/memo" style={{ color: "#58a6ff", fontSize: 13 }}>
        ← All memos
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {memo.pinned && <span title="Pinned" style={{ color: "#d29922" }}>★</span>}
        <Badge color={MEMO_TYPE_COLOR[memo.type]}>{memo.type}</Badge>
        {memo.direction && <Badge color={DIRECTION_COLOR[memo.direction]}>{memo.direction}</Badge>}
        {memo.status !== "active" && <Badge color="#8a97ab">{memo.status}</Badge>}
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(memo.createdAt)}</span>
        <span style={{ marginLeft: "auto" }}>
          <MemoActions id={memo.id} pinned={memo.pinned} status={memo.status} />
        </span>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 12px" }}>{memo.title}</h2>

      {memo.symbols.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
            Point-in-time context (at write)
          </div>
          <PitPanel symbols={memo.symbols as unknown as MemoSymbolView[]} />
        </div>
      )}

      <BriefMarkdown markdown={memo.markdown ?? ""} />
    </div>
  );
}
