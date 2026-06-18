/**
 * Read queries for the morning-brief archive — the signed-in user's own briefs.
 * Read-only, Node runtime only. Writes arrive via the OAuth MCP submit_morning_brief
 * tool → data (which owns data_morning_briefs); web never writes this table.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, morningBriefs } from "../db.js";

/** The user's briefs, newest first — list view (no markdown body). */
export async function listMorningBriefs(userId: string) {
  return db()
    .select({
      briefDate: morningBriefs.briefDate,
      summary: morningBriefs.summary,
      createdAt: morningBriefs.createdAt,
      updatedAt: morningBriefs.updatedAt,
    })
    .from(morningBriefs)
    .where(eq(morningBriefs.userId, userId))
    .orderBy(desc(morningBriefs.briefDate));
}

/** One brief's full markdown + summary, for the detail page. */
export async function getMorningBrief(userId: string, briefDate: string) {
  const rows = await db()
    .select()
    .from(morningBriefs)
    .where(and(eq(morningBriefs.userId, userId), eq(morningBriefs.briefDate, briefDate)))
    .limit(1);
  return rows[0] ?? null;
}
