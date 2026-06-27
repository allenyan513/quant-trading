"use client";

/**
 * Fills resting paper limit orders that have crossed — triggered once when the user
 * opens the Paper section (the paper layout mounts this). There is no background cron:
 * matching happens on page open (mirrors the ensure-on-open data freshness model). If
 * any order filled/expired, it revalidates the account SWR keys so the UI updates.
 */

import { useEffect } from "react";
import { apiSend } from "@/lib/api-client";
import { refreshPaper } from "@/components/paper-ledger";

export function PaperMatchOnOpen() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await apiSend<{ filled: number; expired: number }>("/api/paper/match", "POST");
      if (!cancelled && r.ok && ((r.data?.filled ?? 0) > 0 || (r.data?.expired ?? 0) > 0)) await refreshPaper();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
