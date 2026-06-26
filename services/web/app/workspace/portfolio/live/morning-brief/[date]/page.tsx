import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { BriefDetail } from "@/components/portfolio/brief-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LiveBriefDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const user = await getUser();
  if (!user) redirect("/"); // middleware already guards; defensive
  const { date } = await params;
  return <BriefDetail userId={user.id} date={date} backHref="/workspace/portfolio/live/morning-brief" />;
}
