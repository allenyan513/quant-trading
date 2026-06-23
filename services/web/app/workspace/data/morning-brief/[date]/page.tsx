import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/session";
import { getMorningBrief } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";
import { BriefMarkdown } from "@/components/brief-markdown";
import { fmtFull } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BriefDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const user = await getUser();
  if (!user) redirect("/"); // middleware already guards; defensive
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound(); // invalid date → 404, not a DB type error
  const brief = await getMorningBrief(user.id, date);
  if (!brief) notFound();

  return (
    <div>
      <PageTitle subsystem="data" sub={`Generated ${fmtFull(brief.createdAt)}`}>
        {`Morning brief · ${brief.briefDate}`}
      </PageTitle>
      <Link href="/workspace/data/morning-brief" style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none" }}>
        ← Back to list
      </Link>
      <div style={{ marginTop: 14 }}>
        <BriefMarkdown markdown={brief.markdown} />
      </div>
    </div>
  );
}
