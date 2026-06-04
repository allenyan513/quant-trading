/**
 * The news-triage agent — data's one lightweight LLM (issue #59).
 *
 * Given a staged news item that already passed the deterministic screen, it
 * (1) confirms the symbol, (2) optionally pulls the symbol's fundamentals /
 * technicals / ratings / insider / price-targets — which, via the read-through
 * marketdata cache, WARMS those tables for alpha downstream — and (3) emits a
 * triage verdict: is this material, and how urgent (priority). It does NOT judge
 * direction (bullish/bearish) — that's alpha's repricing job.
 *
 * Like alpha, this uses the plain @anthropic-ai/sdk Messages API with a
 * hand-written tool loop (NOT the Agent SDK's query(), which spawns the claude
 * CLI — a poor fit for stateless Cloud Run). Runs on the cheap triageModel.
 *
 * Cache warming is best-effort: if the agent skips a tool, alpha's own
 * read-through marketdata calls still fill the cache later. Correctness never
 * depends on warming — it's only a latency/quota optimization.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config, marketdata } from "@qt/shared";
import { log } from "./log.js";

const SYSTEM_PROMPT = `You are a news-triage analyst inside an automated trading system. You receive ONE market news item for a single company. Your job is narrow:

1. Confirm the ticker SYMBOL the news is about (correct it if the tagged symbol looks wrong; null if you truly can't tell).
2. Decide if the news is MATERIAL — a real, tradeable catalyst (earnings, guidance, M&A, regulatory action, major contract, analyst action, leadership change) vs routine noise (recaps, listicles, reiterations, generic market commentary).
3. Assign a PRIORITY: high (clear, market-moving catalyst), med (relevant but not urgent), low (marginal).

To judge materiality you MAY pull the symbol's recent context with the tools (fundamentals, technicals, analyst ratings, insider trades, price targets) — e.g. a downgrade matters more if it follows other bearish analyst action. Pull what helps, then decide.

Do NOT judge direction (bullish/bearish) or make a trade call — that is a downstream system's job. You only screen and route.

Workflow: optionally call the read tools, then call emit_triage exactly once.`;

// Bump when SYSTEM_PROMPT / the tool/emit contract changes (triage auditability).
const TRIAGE_PROMPT_VERSION = "1";

const MAX_TURNS = 5;
const MAX_TOKENS = 512;

export type TriagePriority = "low" | "med" | "high";

export interface TriageInput {
  symbol: string; // resolved symbol from screening (uppercased)
  category: string;
  title: string | null;
  text: string | null;
  sector?: string | null;
}

export interface TriageDraft {
  symbol: string | null;
  material: boolean;
  priority: TriagePriority;
  rationale: string;
}

export interface TriageResult extends TriageDraft {
  model: string; // resp.model (provenance)
  promptVersion: string;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_fundamentals",
    description: "Annual financial ratios for a symbol.",
    input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "get_technicals",
    description: "Recent daily closes for a symbol (momentum/levels).",
    input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "get_ratings",
    description: "Recent analyst grade changes (upgrades/downgrades) for a symbol.",
    input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "get_insider",
    description: "Recent insider (Form 4) open-market buys/sells for a symbol.",
    input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "get_price_targets",
    description: "Recent analyst price-target changes for a symbol.",
    input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "emit_triage",
    description: "Emit the final triage verdict for this news item. Call exactly once.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: ["string", "null"] },
        material: { type: "boolean" },
        priority: { type: "string", enum: ["low", "med", "high"] },
        rationale: { type: "string" },
      },
      required: ["material", "priority", "rationale"],
    },
  },
];

let _client: Anthropic | null = null;
function client(): Anthropic {
  // maxRetries above the SDK default (2): triage runs several agents concurrently
  // and can momentarily exceed the per-minute input-token rate limit (429); the
  // SDK's exponential backoff rides out the burst instead of failing the item.
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey(), maxRetries: 5 });
  return _client;
}

/**
 * Read-only tool dispatch. Each read warms the corresponding marketdata cache.
 * Errors are isolated (cache warming is best-effort): a transient FMP/DB failure
 * returns an error string to the model rather than aborting the whole triage.
 * `at` goes AFTER the raw spread so a raw `at` field can't clobber the PIT ts.
 */
async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  const sym = String(input.symbol ?? "");
  try {
    switch (name) {
      case "get_fundamentals": {
        const rows = await marketdata.getRatios(sym, "annual", 4);
        return JSON.stringify(rows.map((r) => r.data)).slice(0, 3000);
      }
      case "get_technicals": {
        const rows = await marketdata.getDailyPrices(sym, 60);
        return JSON.stringify(rows.map((r) => ({ d: r.tradeDate, c: r.close }))).slice(0, 3000);
      }
      case "get_ratings": {
        const rows = await marketdata.getRatings(sym, 10);
        return JSON.stringify(rows.map((r) => ({ ...r.data, at: r.observedAt }))).slice(0, 3000);
      }
      case "get_insider": {
        const rows = await marketdata.getInsider(sym, 10);
        return JSON.stringify(rows.map((r) => ({ ...r.data, at: r.observedAt }))).slice(0, 3000);
      }
      case "get_price_targets": {
        const rows = await marketdata.getPriceTargets(sym, 10);
        return JSON.stringify(rows.map((r) => ({ ...r.data, at: r.observedAt }))).slice(0, 3000);
      }
      default:
        return `unknown tool: ${name}`;
    }
  } catch (err) {
    log.warn("triage.agent.tool_failed", { tool: name, symbol: sym, error: err instanceof Error ? err.message : String(err) });
    return `error calling ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Build the user prompt for one news item (pure — unit-tested). */
export function buildTriagePrompt(input: TriageInput): string {
  return [
    `NEWS ITEM for ${input.symbol}${input.sector ? ` (sector: ${input.sector})` : ""}`,
    `  category: ${input.category}`,
    `  title: ${input.title ?? ""}`,
    `  body: ${(input.text ?? "").slice(0, 2000)}`,
    "",
    "Triage it: confirm the symbol, judge materiality and priority, then call emit_triage.",
  ].join("\n");
}

const PRIORITIES: readonly TriagePriority[] = ["low", "med", "high"];

/** Coerce the model's emit_triage payload into a safe TriageDraft. */
export function sanitizeTriageDraft(raw: Partial<TriageDraft>, fallbackSymbol: string): TriageDraft {
  const priority = PRIORITIES.includes(raw.priority as TriagePriority)
    ? (raw.priority as TriagePriority)
    : "low";
  const symbol = typeof raw.symbol === "string" && raw.symbol.trim()
    ? raw.symbol.trim().toUpperCase()
    : raw.symbol === null
      ? null
      : fallbackSymbol;
  return {
    symbol,
    material: raw.material === true,
    priority,
    rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 2000) : "",
  };
}

/** Run the triage agent for one (already-screened) news item. */
export async function runTriageAgent(input: TriageInput): Promise<TriageResult> {
  const userPrompt = buildTriagePrompt(input);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  log.info("triage.agent.start", { symbol: input.symbol, category: input.category, model: config.triageModel() });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const forceEmit = turn === MAX_TURNS - 1;
    const resp = await client().messages.create({
      model: config.triageModel(),
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: forceEmit ? { type: "tool", name: "emit_triage" } : { type: "auto" },
      messages,
    });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    log.debug("triage.agent.turn", {
      symbol: input.symbol,
      turn: turn + 1,
      stop_reason: resp.stop_reason,
      tools: toolUses.map((b) => b.name).join(",") || "none",
    });

    const emit = toolUses.find((b) => b.name === "emit_triage");
    if (emit) {
      const draft = sanitizeTriageDraft(emit.input as Partial<TriageDraft>, input.symbol);
      log.info("triage.agent.emit", {
        symbol: input.symbol,
        turns: turn + 1,
        material: draft.material,
        priority: draft.priority,
      });
      return { ...draft, model: resp.model, promptVersion: TRIAGE_PROMPT_VERSION };
    }

    if (toolUses.length === 0) {
      messages.push({ role: "assistant", content: resp.content });
      messages.push({ role: "user", content: "Call emit_triage now with your verdict." });
      continue;
    }

    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await runTool(tu.name, tu.input as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  log.error("triage.agent.no_verdict", { symbol: input.symbol, max_turns: MAX_TURNS });
  throw new Error("triage agent did not emit a verdict within turn budget");
}
