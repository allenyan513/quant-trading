"use client";

/** Client action bar for a memo detail page: pin/unpin, close/reopen, delete. Each
 *  forwards to the data service via web's write routes, then refreshes / navigates. */
import { useRouter } from "@/lib/next-navigation";
import { useState } from "react";
import { apiAction } from "@/lib/api-client";

export function MemoActions({ id, pinned, status }: { id: string; pinned: boolean; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      if (await apiAction(`/api/memos/${id}/update`, "POST", body)) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (busy || !confirm("Delete this memo?")) return;
    setBusy(true);
    try {
      if (await apiAction(`/api/memos/${id}/delete`, "POST", {})) router.push("/workspace/memo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => act({ pinned: !pinned })} disabled={busy} style={btn}>
        {pinned ? "Unpin" : "Pin"}
      </button>
      <button onClick={() => act({ status: status === "closed" ? "active" : "closed" })} disabled={busy} style={btn}>
        {status === "closed" ? "Reopen" : "Close"}
      </button>
      <button onClick={del} disabled={busy} style={{ ...btn, color: "#f85149" }}>
        Delete
      </button>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  padding: "5px 11px",
  fontSize: 12.5,
  cursor: "pointer",
};
