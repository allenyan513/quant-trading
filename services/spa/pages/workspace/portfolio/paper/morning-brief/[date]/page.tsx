"use client";

import { useParams } from "react-router-dom";
import { BriefDetail } from "@/components/portfolio/brief-detail";

export default function PaperBriefDetailPage() {
  const { date = "" } = useParams<{ date: string }>();
  return <BriefDetail date={date} backHref="/workspace/portfolio/paper/morning-brief" />;
}
