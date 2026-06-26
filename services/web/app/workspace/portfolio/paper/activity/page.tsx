"use client";

/** Paper · Activity — the order blotter (every fill / rejection, newest first). */

import { useLive } from "@/components/live";
import { PaperBlotter, type PaperAccount } from "@/components/paper-ledger";

export default function PaperActivityPage() {
  const { data: acct, error } = useLive<PaperAccount>("/api/paper/account");
  if (error) return <p style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</p>;
  return <PaperBlotter orders={acct?.orders ?? []} />;
}
