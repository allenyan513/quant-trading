/**
 * LLM critique of resolved signals -> feedback_notes (the retrieval-augmented
 * lessons store the analysis agent reads before generating new signals).
 * Uses the plain Anthropic Messages API with forced tool-use for structured
 * output (pattern from quant-researcher's generator.py).
 */
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { eq, inArray } from "drizzle-orm";
import { db, dbSchema, config } from "@qt/shared";

const { tradingSignals, signalOutcomes, feedbackNotes, events } = dbSchema;

const SYSTEM = `You are a trading-signal reviewer. Given a closed/resolved signal — its event, thesis, direction, target/stop, and realized outcome — judge what the analyst should LEARN. Be concrete and brief. Score quality 1-10. Write a single actionable lesson (one or two sentences) that a future analyst should recall when handling similar symbol/event-type situations.`;

const CRITIQUE_TOOL: Anthropic.Tool = {
  name: "emit_critique",
  description: "Emit the structured critique for this resolved signal.",
  input_schema: {
    type: "object",
    properties: {
      quality_score: { type: "integer", minimum: 1, maximum: 10 },
      thesis_quality: { type: "string", enum: ["poor", "fair", "good"] },
      lesson: { type: "string" },
    },
    required: ["quality_score", "lesson"],
  },
};

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey() });
  return _client;
}

const RESOLVED = ["target_hit", "stopped_out", "expired", "closed"];

export async function critiqueResolved(limit = 20): Promise<{ reviewed: number }> {
  // Resolved signals that don't yet have a feedback note.
  const noted = await db().select({ signalId: feedbackNotes.signalId }).from(feedbackNotes);
  const notedIds = noted.map((n) => n.signalId).filter((x): x is string => !!x);

  const resolved = await db()
    .select()
    .from(tradingSignals)
    .where(inArray(tradingSignals.status, RESOLVED))
    .limit(limit);
  const candidates = resolved.filter((s) => !notedIds.includes(s.id));

  let reviewed = 0;
  for (const s of candidates) {
    const outcomes = await db()
      .select()
      .from(signalOutcomes)
      .where(eq(signalOutcomes.signalId, s.id));

    // Resolve the originating event_type so the lesson is retrievable by the
    // analysis agent's read_recent_feedback(symbol, event_type) tool — this is
    // what closes the feedback loop.
    let eventType: string | null = null;
    if (s.eventId) {
      const ev = await db()
        .select({ eventType: events.eventType })
        .from(events)
        .where(eq(events.id, s.eventId));
      eventType = ev[0]?.eventType ?? null;
    }

    const userMsg = JSON.stringify({
      symbol: s.symbol,
      direction: s.direction,
      conviction: s.conviction,
      thesis: s.thesis,
      target_price: s.targetPrice,
      stop_loss: s.stopLoss,
      entry_price: s.entryPrice,
      final_status: s.status,
      outcomes,
    });

    const resp = await client().messages.create({
      model: config.critiqueModel(),
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [CRITIQUE_TOOL],
      tool_choice: { type: "tool", name: "emit_critique" },
      messages: [{ role: "user", content: `Review this resolved signal:\n${userMsg}` }],
    });

    const block = resp.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") continue;
    const input = block.input as { quality_score: number; thesis_quality?: string; lesson: string };

    await db().insert(feedbackNotes).values({
      id: randomUUID(),
      signalId: s.id,
      symbol: s.symbol,
      eventType,
      lesson: input.lesson,
      scores: { quality_score: input.quality_score, thesis_quality: input.thesis_quality ?? null },
    });
    reviewed++;
  }
  return { reviewed };
}
