/**
 * Shared morning-brief detail body, used by both the Live and Paper `[date]` pages —
 * the brief is user-level, so only the back-link base differs. Server component (reads
 * the DB), kept out of the "use client" list deliberately.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getMorningBrief } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";
import { BriefMarkdown } from "@/components/brief-markdown";
import { fmtFull } from "@/lib/format";

export async function BriefDetail({ userId, date, backHref }: { userId: string; date: string; backHref: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound(); // invalid date → 404, not a DB type error
  const brief = await getMorningBrief(userId, date);
  if (!brief) notFound();
  return (
    <div>
      <PageTitle subsystem="portfolio" sub={`Generated ${fmtFull(brief.createdAt)}`}>{`Morning brief · ${brief.briefDate}`}</PageTitle>
      <Link href={backHref} style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none" }}>
        ← Back to list
      </Link>
      <div style={{ marginTop: 14 }}>
        <BriefMarkdown markdown={brief.markdown} />
      </div>
    </div>
  );
}
