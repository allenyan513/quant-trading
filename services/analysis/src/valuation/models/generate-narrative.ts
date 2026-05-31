// @ts-nocheck — vendored from legends/value-scope; type-checked at origin, validated by ported tests. Public exports remain typed for callers.
import { buildNarrativeFacts } from "./narrative-facts.js";
import type { NarrativeFacts, ValuationNarrative, ValuationSummary } from "../types.js";

const OPENAI_MODEL = process.env.OPENAI_VALUATION_MODEL || "gpt-4o-mini";
const NARRATIVE_PROMPT_VERSION = "v3";

interface GeneratedNarrativePayload {
  headline: string;
  quick_take: string;
  full_narrative: string;
  seo_excerpt: string;
  confidence: "low" | "medium" | "high";
  key_drivers: string[];
  risk_flags: string[];
}

export interface GenerateNarrativeResult {
  facts: NarrativeFacts;
  narrative: ValuationNarrative;
  promptVersion: string;
  latencyMs: number | null;
  errorMessage?: string;
}

function summarizePricePosition(pricePosition: NarrativeFacts["price_position"]): string {
  switch (pricePosition) {
    case "below_range":
      return "below the model range";
    case "lower_band":
      return "in the lower end of the model range";
    case "mid_range":
      return "near the middle of the model range";
    case "upper_band":
      return "in the upper end of the model range";
    case "above_range":
      return "above the model range";
  }
}

function summarizeDispersion(spreadPctOfMedian: number | null): string {
  if (spreadPctOfMedian === null) return "model coverage is limited";
  if (spreadPctOfMedian >= 60) return "model disagreement is wide";
  if (spreadPctOfMedian >= 30) return "model disagreement is meaningful";
  return "model clustering is relatively tight";
}

function buildHeadline(facts: NarrativeFacts): string {
  if (facts.verdict === "undervalued") {
    return `${facts.ticker} screens below most fair value estimates`;
  }
  if (facts.verdict === "overvalued") {
    return `${facts.ticker} trades toward the rich end of valuation estimates`;
  }
  return `${facts.ticker} trades close to the center of its valuation range`;
}

export function buildFallbackValuationNarrative(summary: ValuationSummary): ValuationNarrative {
  const facts = buildNarrativeFacts(summary);
  const headline = buildHeadline(facts);
  const primaryLabel = facts.primary_model?.label ?? facts.verdict_basis;
  const bullishLabel = facts.bullish_model?.label ?? "the optimistic case";
  const bearishLabel = facts.bearish_model?.label ?? "the conservative case";
  const pricePosition = summarizePricePosition(facts.price_position);
  const dispersion = summarizeDispersion(facts.spread_pct_of_median);

  const quickTake =
    `${facts.company_name} (${facts.ticker}) looks ${facts.verdict.replace("_", " ")} on our current valuation work, ` +
    `with the stock trading ${pricePosition} while ${dispersion}. ` +
    `${primaryLabel} remains the main anchor for the headline fair value.`;

  const fullNarrative =
    `${facts.company_name} (${facts.ticker}) currently screens as ${facts.verdict.replace("_", " ")} ` +
    `based on our ${facts.verdict_basis} framework, but the broader takeaway is how the full model set frames the debate. ` +
    `${bullishLabel} sets the more optimistic end of the range, while ${bearishLabel} marks the conservative case, ` +
    `which means the stock's valuation still depends on which earnings or cash-flow path investors believe is most durable. ` +
    `At the moment, shares trade ${pricePosition}, and ${dispersion}. ` +
    `The key drivers remain ${facts.key_drivers.join(", ")}, while the main risk flags are ${facts.risk_flags.join(", ") || "execution and assumption sensitivity"}.`;

  const seoExcerpt =
    `${facts.company_name} (${facts.ticker}) valuation summary: shares trade ${pricePosition}, ${dispersion}, and our models highlight ` +
    `${facts.key_drivers.slice(0, 2).join(" and ")} as the main variables behind fair value.`;

  return {
    version: "v1",
    status: "fallback",
    generated_at: new Date().toISOString(),
    headline,
    quick_take: quickTake,
    full_narrative: fullNarrative,
    seo_excerpt: seoExcerpt,
    confidence:
      facts.spread_pct_of_median === null ? "low" :
      facts.spread_pct_of_median >= 60 ? "low" :
      facts.spread_pct_of_median >= 30 ? "medium" :
      "high",
    key_drivers: facts.key_drivers,
    risk_flags: facts.risk_flags,
  };
}

function buildStyleBrief(facts: NarrativeFacts): string {
  if (facts.valuation_tier === "pre_profit") {
    return [
      "Explain why pre-profit valuation models can produce very different outputs when revenue growth, margin convergence, and terminal assumptions change.",
      "Write for an investor who understands the company but may not understand valuation jargon.",
    ].join(" ");
  }

  return [
    "Explain why different valuation models can reasonably produce different prices for the same stock.",
    "Write for an investor who generally knows the business but may not know DCF, PEG, EPV, or multiples-based valuation in depth.",
  ].join(" ");
}

function buildPrompt(facts: NarrativeFacts): string {
  return [
    "Write an AI-generated valuation interpretation in plain English for investors.",
    "Use only the supplied facts.",
    "The user likely already knows the company at a high level. The job is not to explain the business. The job is to explain the valuation disagreement.",
    "Prioritize interpretation over enumeration.",
    "Explain in simple language why different models give different prices.",
    "Translate valuation jargon into natural investor language.",
    "If you mention a model like DCF, PEG, EPV, or EV/EBITDA, briefly imply what it emphasizes instead of assuming the reader already knows.",
    "Focus on what the optimistic models are assuming, what the conservative models are assuming, and what that means for how to read the current stock price.",
    "State whether the current price looks closer to the optimistic case, the conservative case, or the middle of the valuation debate.",
    "Use conditional language when discussing future outcomes.",
    "Do not give investment advice or use promotional language.",
    "Do not say 'our models show' repeatedly.",
    "Avoid sounding mechanical or formulaic.",
    "Avoid listing too many numbers. Use at most 3 explicit numerical references in the full narrative and only the most decision-useful ones.",
    "Keep quick_take to 40-70 words.",
    "Keep full_narrative to 160-240 words.",
    "Write the full narrative as 1 compact paragraph.",
    "Do not use bullet points inside quick_take or full_narrative.",
    "The quick_take should read like a sharp takeaway for a non-expert investor.",
    "The headline should clearly sound like an AI-generated valuation interpretation, not an editor-written article title.",
    "Avoid overemphasizing company strategy, product detail, or segment commentary unless it directly explains why valuation models diverge.",
    `Style brief: ${buildStyleBrief(facts)}`,
    `Facts JSON: ${JSON.stringify(facts)}`,
  ].join("\n");
}

function narrativeJsonSchema() {
  return {
    name: "valuation_narrative",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "quick_take", "full_narrative", "seo_excerpt", "confidence", "key_drivers", "risk_flags"],
      properties: {
        headline: { type: "string" },
        quick_take: { type: "string" },
        full_narrative: { type: "string" },
        seo_excerpt: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        key_drivers: {
          type: "array",
          items: { type: "string" },
        },
        risk_flags: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  };
}

function sanitizePayload(payload: GeneratedNarrativePayload): GeneratedNarrativePayload {
  const seoExcerpt = payload.seo_excerpt.trim().replace(/\s+/g, " ");
  const normalizedFullNarrative = payload.full_narrative.trim().replace(/\s+/g, " ");
  const loweredRiskFlags = payload.risk_flags.map((v) => v.trim().toLowerCase());

  let confidence = payload.confidence;
  if (loweredRiskFlags.includes("wide model dispersion") && confidence === "high") {
    confidence = "medium";
  }

  return {
    headline: payload.headline.trim().slice(0, 120),
    quick_take: payload.quick_take.trim().slice(0, 500),
    full_narrative: normalizedFullNarrative.slice(0, 1400),
    seo_excerpt: seoExcerpt.length > 300
      ? `${seoExcerpt.slice(0, 297).trimEnd()}...`
      : seoExcerpt,
    confidence,
    key_drivers: payload.key_drivers.map((v) => v.trim()).filter(Boolean).slice(0, 4),
    risk_flags: payload.risk_flags.map((v) => v.trim()).filter(Boolean).slice(0, 4),
  };
}

async function callOpenAIForNarrative(facts: NarrativeFacts): Promise<GeneratedNarrativePayload> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildPrompt(facts),
      max_output_tokens: 1200,
      reasoning: {
        effort: "low",
      },
      text: {
        format: {
          type: "json_schema",
          ...narrativeJsonSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${message}`);
  }

  const data = await response.json() as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const fallbackText = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => typeof part.text === "string" && part.text.trim().length > 0)
    ?.text;

  const rawText = data.output_text ?? fallbackText;
  if (!rawText) {
    throw new Error(`OpenAI response missing text output: ${JSON.stringify({
      status: (data as { status?: string }).status,
      output_items: Array.isArray(data.output) ? data.output.map((item) => item.content?.map((part) => part.type) ?? item.type ?? "unknown") : null,
    })}`);
  }

  return sanitizePayload(JSON.parse(rawText) as GeneratedNarrativePayload);
}

export async function generateValuationNarrative(summary: ValuationSummary): Promise<GenerateNarrativeResult> {
  const facts = buildNarrativeFacts(summary);
  const startedAt = Date.now();

  if (!process.env.OPENAI_API_KEY) {
    return {
      facts,
      narrative: buildFallbackValuationNarrative(summary),
      promptVersion: NARRATIVE_PROMPT_VERSION,
      latencyMs: null,
    };
  }

  try {
    const payload = await callOpenAIForNarrative(facts);
    return {
      facts,
      narrative: {
        version: "v1",
        status: "generated",
        provider: "openai",
        model: OPENAI_MODEL,
        generated_at: new Date().toISOString(),
        ...payload,
      },
      promptVersion: NARRATIVE_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      facts,
      narrative: buildFallbackValuationNarrative(summary),
      promptVersion: NARRATIVE_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function attachValuationNarrative(summary: ValuationSummary): Promise<GenerateNarrativeResult> {
  try {
    const result = await generateValuationNarrative(summary);
    summary.narrative = result.narrative;
    return result;
  } catch (error) {
    console.error(`[valuation-narrative] Failed for ${summary.ticker}:`, error);
    summary.narrative = buildFallbackValuationNarrative(summary);
    return {
      facts: buildNarrativeFacts(summary),
      narrative: summary.narrative,
      promptVersion: NARRATIVE_PROMPT_VERSION,
      latencyMs: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}