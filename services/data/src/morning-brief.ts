/**
 * Morning brief storage (data_morning_briefs). The brief's narrative is generated
 * by the user's OWN Claude (skill + web search, on their subscription) and posted
 * back via the OAuth MCP `submit_morning_brief` tool → gateway forwards here (T12). data
 * just stores it — runs no LLM. Idempotent by (user_id, brief_date): re-submitting
 * the same day overwrites.
 */
import { db, dbSchema, codeVersion } from "@qt/shared";

const { morningBriefs } = dbSchema;

export async function submitMorningBrief(
  userId: string,
  briefDate: string,
  markdown: string,
  summary?: unknown,
): Promise<{ userId: string; briefDate: string }> {
  const uid = userId.trim();
  const d = briefDate.trim();
  if (!uid || !d) throw new Error("userId and briefDate are required");
  if (!markdown.trim()) throw new Error("markdown is required");
  const cv = codeVersion();
  const summaryVal = (summary ?? null) as Record<string, unknown> | null;
  await db()
    .insert(morningBriefs)
    .values({ userId: uid, briefDate: d, markdown, summary: summaryVal, codeVersion: cv })
    .onConflictDoUpdate({
      target: [morningBriefs.userId, morningBriefs.briefDate],
      set: { markdown, summary: summaryVal, codeVersion: cv, updatedAt: new Date() },
    });
  return { userId: uid, briefDate: d };
}
