/**
 * The signal-generation agent (System B brain).
 *
 * It reprices from the event narrative — the slow reference valuation is just one
 * input — and emits a structured signal via the forced `emit_signal` tool.
 *
 * Implementation note: we use the plain `@anthropic-ai/sdk` Messages API with a
 * hand-written tool-use loop rather than the Agent SDK's query(). The Agent SDK
 * spawns the `claude` CLI as a subprocess (extra binary in the image, CLI-style
 * auth), which is a poor fit for a stateless Cloud Run microservice. The Messages
 * API authenticates with a plain ANTHROPIC_API_KEY, has lower latency, and gives
 * us deterministic control over the tool loop. The agentic behavior (multi-turn
 * tool calls + forced final tool) is preserved.
 *
 * System prompt adapted from
 * legends/quant-researcher/quant_researcher/signal_system/generator.py.
 */
import Anthropic from "@anthropic-ai/sdk";
import { desc, eq, and } from "drizzle-orm";
import { fmpGet, db, dbSchema, config, type SignalDraft, type ReferenceValuation } from "@qt/shared";
import type { NormalizedEvent } from "./classify.js";

const { feedbackNotes } = dbSchema;

const SYSTEM_PROMPT = `You are an event-driven pricing analyst inside an automated trading-signal service. Given a market EVENT (earnings, rating change, price-target change, insider, M&A) and FACTS about the company (current price plus a slow, financials-based reference fair value), decide the trade NOW.

Critical: the reference fair value is just ONE input — it lags (quarterly data) and has NOT moved on today's event. Your job is to REPRICE from the event itself: read what changed, optionally pull fundamentals/technicals, check past lessons for this symbol/event type, then translate into an actionable signal. If the event is immaterial, return direction "hold".

Workflow: (1) call read_recent_feedback to learn from past mistakes; (2) optionally call get_fundamentals / get_technicals; (3) call emit_signal exactly once with your decision.

Always emit: direction (buy/sell/hold); absolute target_price and stop_loss; horizon in days; conviction (low/medium/high — notification priority only, NOT position size); and a one-paragraph thesis that explicitly references the event. Position sizing is out of scope.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_recent_feedback",
    description: "Read recent lessons/feedback for this symbol or event type to avoid past mistakes.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        event_type: { type: "string", description: "Event type, e.g. earnings, grade_change" },
      },
      required: ["symbol", "event_type"],
    },
  },
  {
    name: "get_fundamentals",
    description: "Fetch key financial ratios/metrics (TTM) for a symbol.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_technicals",
    description: "Fetch recent daily prices for a symbol to judge momentum/levels.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
  {
    name: "emit_signal",
    description: "Emit the final structured trading signal for this event. Call exactly once.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["buy", "sell", "hold"] },
        target_price: { type: ["number", "null"] },
        stop_loss: { type: ["number", "null"] },
        horizon_days: { type: ["integer", "null"] },
        conviction: { type: "string", enum: ["low", "medium", "high"] },
        thesis: { type: "string" },
      },
      required: ["direction", "conviction", "thesis"],
    },
  },
];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey() });
  return _client;
}

/** Execute a read-only tool call; returns a string the model can read. */
async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "read_recent_feedback": {
      const symbol = String(input.symbol ?? "").toUpperCase();
      const eventType = String(input.event_type ?? "");
      const rows = await db()
        .select({ lesson: feedbackNotes.lesson })
        .from(feedbackNotes)
        .where(and(eq(feedbackNotes.symbol, symbol), eq(feedbackNotes.eventType, eventType)))
        .orderBy(desc(feedbackNotes.createdAt))
        .limit(5);
      return rows.length ? rows.map((r) => `- ${r.lesson}`).join("\n") : "No prior feedback recorded.";
    }
    case "get_fundamentals": {
      const data = await fmpGet("ratios-ttm", { symbol: String(input.symbol) }, { softFail402: true });
      return JSON.stringify(data ?? {}).slice(0, 4000);
    }
    case "get_technicals": {
      const data = await fmpGet(
        "historical-price-eod/light",
        { symbol: String(input.symbol) },
        { softFail402: true },
      );
      return JSON.stringify(data ?? {}).slice(0, 4000);
    }
    default:
      return `unknown tool: ${name}`;
  }
}

const MAX_TURNS = 6;

export async function generateSignal(
  event: NormalizedEvent,
  ref: ReferenceValuation,
): Promise<SignalDraft> {
  const userPrompt = [
    "EVENT",
    `  symbol: ${event.symbol}`,
    `  type: ${event.eventType}`,
    `  direction_hint: ${event.directionHint ?? "none"}`,
    `  headline: ${event.headline ?? ""}`,
    `  raw: ${JSON.stringify(event.raw)}`,
    "",
    "FACTS (reference valuation, financials-based — lags the event)",
    `  current_price: ${ref.current_price}`,
    `  fair_value_per_share: ${ref.fair_value_per_share}`,
    `  upside_pct: ${ref.upside_pct}`,
    `  verdict: ${ref.verdict}`,
    "",
    "Reprice from the event and emit the signal.",
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // On the last allowed turn, force the model to finalize via emit_signal.
    const forceEmit = turn === MAX_TURNS - 1;
    const resp = await client().messages.create({
      model: config.signalModel(),
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: forceEmit ? { type: "tool", name: "emit_signal" } : { type: "auto" },
      messages,
    });

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Check for the terminal emit_signal call first.
    const emit = toolUses.find((b) => b.name === "emit_signal");
    if (emit) {
      const p = emit.input as Partial<SignalDraft>;
      return {
        direction: (p.direction ?? "hold") as SignalDraft["direction"],
        target_price: p.target_price ?? null,
        stop_loss: p.stop_loss ?? null,
        horizon_days: p.horizon_days ?? null,
        conviction: (p.conviction ?? "medium") as SignalDraft["conviction"],
        thesis: p.thesis ?? "",
      };
    }

    if (toolUses.length === 0) {
      // Model answered in prose without a tool — nudge it to emit.
      messages.push({ role: "assistant", content: resp.content });
      messages.push({ role: "user", content: "Call emit_signal now with your decision." });
      continue;
    }

    // Execute the requested read-only tools and feed results back.
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await runTool(tu.name, tu.input as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  throw new Error("agent did not emit a signal within turn budget");
}
