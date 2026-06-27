"use client";

/**
 * Shared morning-brief detail body, used by both the Live and Paper `[date]` pages —
 * the brief is user-level, so only the back-link base differs. Converted from web's
 * server component to a client fetch: pulls the brief from the gateway (`GET
 * /api/morning-brief/:date`, session-scoped) instead of reading the DB directly.
 */
import Link from "@/components/link";
import { useLive } from "@/components/live";
import { PageTitle } from "@/components/page-title";
import { BriefMarkdown } from "@/components/brief-markdown";
import { fmtFull } from "@/lib/format";

interface Brief {
  briefDate: string;
  createdAt: string;
  markdown: string;
}

export function BriefDetail({ date, backHref }: { date: string; backHref: string }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  // SWR skips the fetch when the key is null (invalid date → show not-found).
  const { data: brief, error } = useLive<Brief | null>(valid ? `/api/morning-brief/${date}` : (null as unknown as string));

  if (!valid || error || brief === null) {
    return (
      <div>
        <Link href={backHref} style={{ color: "#58a6ff", fontSize: 13 }}>← Back to list</Link>
        <div style={{ marginTop: 14, color: "var(--muted)" }}>Morning brief not found.</div>
      </div>
    );
  }
  if (!brief) return <div style={{ color: "var(--muted)" }}>Loading…</div>;

  return (
    <div>
      <PageTitle sub={`Generated ${fmtFull(brief.createdAt)}`}>{`Morning brief · ${brief.briefDate}`}</PageTitle>
      <Link href={backHref} style={{ color: "#58a6ff", fontSize: 13 }}>← Back to list</Link>
      <div style={{ marginTop: 14 }}>
        <BriefMarkdown markdown={brief.markdown} />
      </div>
    </div>
  );
}
