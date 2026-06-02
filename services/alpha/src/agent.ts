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
import { config, marketdata, type SignalDraft, type ReferenceValuation } from "@qt/shared";
import type { NormalizedNotification } from "./classify.js";
import { sanitizeSignalDraft } from "./signal-draft.js";
import { log } from "./log.js";

const SYSTEM_PROMPT = `You are an event-driven pricing analyst inside an automated trading-signal service. Given a NOTIFICATION — one or more related market EVENTS of the same type (earnings, rating change, price-target change, insider, M&A) for a single company — plus FACTS about the company (current price plus a slow, financials-based reference fair value), decide the trade NOW.

Critical: the reference fair value is just ONE input — it lags (quarterly data) and has NOT moved on today's events. Your job is to REPRICE from the events themselves, weighing them together: read what changed, optionally pull fundamentals/technicals, then translate into a SINGLE actionable signal for the symbol. If the events are immaterial, return direction "hold".

Workflow: (1) optionally call get_fundamentals / get_technicals; (2) call emit_signal exactly once with your decision.

Always emit: direction (buy/sell/hold); absolute target_price and stop_loss; horizon in days; conviction (low/medium/high — notification priority only, NOT position size); and a one-paragraph thesis that explicitly references the events. Position sizing is out of scope.`;

// Bump whenever SYSTEM_PROMPT (or the tool/loop contract) changes — lets us bucket
// signal performance by prompt version (T1 auditability).
const PROMPT_VERSION = "1";

/** Full LLM provenance for one generated signal — persisted for replay/audit. */
export interface SignalAudit {
  model: string; // actual served model id (resp.model)
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  messages: Anthropic.MessageParam[]; // full conversation incl. final emit_signal turn
  turns: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentResult {
  draft: SignalDraft;
  audit: SignalAudit;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_fundamentals",
    description: "Fetch key annual financial ratios/metrics for a symbol.",
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
    description: "Emit the final structured trading signal for this notification. Call exactly once.",
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
    case "get_fundamentals": {
      // Read-through marketdata cache → financial_ratios (PIT, reused next time).
      // Annual: quarterly ratios are premium-gated (402) on the current FMP plan.
      const rows = await marketdata.getRatios(String(input.symbol), "annual", 4);
      return JSON.stringify(rows.map((r) => r.data)).slice(0, 4000);
    }
    case "get_technicals": {
      // Read-through marketdata cache → daily_prices. Return recent closes.
      const rows = await marketdata.getDailyPrices(String(input.symbol), 60);
      return JSON.stringify(rows.map((r) => ({ d: r.tradeDate, c: r.close }))).slice(0, 4000);
    }
    default:
      return `unknown tool: ${name}`;
  }
}

const MAX_TURNS = 6;

export async function generateSignal(
  notif: NormalizedNotification,
  ref: ReferenceValuation,
): Promise<AgentResult> {
  // Bundle can be large (e.g. many news items); cap each raw so the prompt stays
  // bounded — the agent can pull more detail via the read-only tools if needed.
  const eventsBlock = notif.events
    .map((e, i) =>
      [
        `  [${i + 1}] direction_hint: ${e.directionHint ?? "none"}`,
        `      headline: ${e.headline ?? ""}`,
        `      raw: ${JSON.stringify(e.raw).slice(0, 600)}`,
      ].join("\n"),
    )
    .join("\n");
  const userPrompt = [
    `NOTIFICATION — ${notif.events.length} ${notif.eventType} event(s) for ${notif.symbol}`,
    notif.summary ? `  summary: ${notif.summary}` : "",
    "",
    "EVENTS (newest first)",
    eventsBlock,
    "",
    "FACTS (reference valuation, financials-based — lags the events)",
    `  current_price: ${ref.current_price}`,
    `  fair_value_per_share: ${ref.fair_value_per_share}`,
    `  upside_pct: ${ref.upside_pct}`,
    `  verdict: ${ref.verdict}`,
    "",
    "Reprice from the events as a whole and emit ONE signal.",
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  log.info("agent.start", {
    symbol: notif.symbol,
    type: notif.eventType,
    count: notif.events.length,
    model: config.signalModel(),
  });

  let inputTokens = 0;
  let outputTokens = 0;

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

    inputTokens += resp.usage.input_tokens;
    outputTokens += resp.usage.output_tokens;

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    log.debug("agent.turn", {
      symbol: notif.symbol,
      turn: turn + 1,
      stop_reason: resp.stop_reason,
      tools: toolUses.map((b) => b.name).join(",") || "none",
      in_tokens: resp.usage.input_tokens,
      out_tokens: resp.usage.output_tokens,
    });

    // Check for the terminal emit_signal call first.
    const emit = toolUses.find((b) => b.name === "emit_signal");
    if (emit) {
      // Deterministic guardrail: drop implausible numeric levels (never fabricate).
      const { draft, warnings } = sanitizeSignalDraft(emit.input as Partial<SignalDraft>, ref.current_price);
      if (warnings.length) {
        log.warn("agent.emit.sanitized", { symbol: notif.symbol, warnings });
      }
      log.info("agent.emit", {
        symbol: notif.symbol,
        turns: turn + 1,
        direction: draft.direction,
        conviction: draft.conviction,
      });
      const audit: SignalAudit = {
        model: resp.model,
        promptVersion: PROMPT_VERSION,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        // Include this final assistant turn (the emit_signal tool_use) so the
        // stored conversation is complete and replayable.
        messages: [...messages, { role: "assistant", content: resp.content }],
        turns: turn + 1,
        inputTokens,
        outputTokens,
      };
      return { draft, audit };
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
      log.debug("agent.tool", { symbol: notif.symbol, tool: tu.name, input: tu.input });
      const out = await runTool(tu.name, tu.input as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  log.error("agent.no_signal", { symbol: notif.symbol, max_turns: MAX_TURNS });
  throw new Error("agent did not emit a signal within turn budget");
}
