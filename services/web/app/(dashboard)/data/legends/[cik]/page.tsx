import { redirect } from "next/navigation";

/** Bare /data/legends/[cik] → land on the Holdings tab. Server component, so the
 *  redirect is safe (no client-tree React #310). */
export default async function LegendIndex({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  redirect(`/data/legends/${cik}/holdings`);
}
