import Link from "@/components/link";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";
import { MODEL_NAMES, MODEL_ORDER, MODEL_LINKS } from "@qt/shared/valuation-model-names";
import { ENABLE_AI_NARRATIVE } from "@/lib/constants";
import type { ValuationSummary, ValuationResult } from "@/types";
import type { ReactNode } from "react";

interface Props {
  summary: ValuationSummary;
  updatedAt?: string;
}

// --- Pillar group config ---
const PILLAR_CONFIG = [
  {
    key: "dcf" as const,
    label: "Discounted Cash Flow",
    link: "/valuation#dcf",
  },
  {
    key: "tradingMultiples" as const,
    label: "Trading Multiples",
    link: "/valuation#trading-multiples",
  },
  {
    key: "peg" as const,
    label: "PEG",
    link: "/valuation#peg",
  },
  {
    key: "epv" as const,
    label: "Earnings Power Value",
    link: "/valuation#epv",
  },
  {
    key: "ddm" as const,
    label: "Dividend Discount",
    link: "/valuation#ddm",
  },
];

const NARRATIVE_LINKS: Array<{ term: string; href: string }> = [
  { term: "EV/EBITDA", href: "/valuation#trading-multiples" },
  { term: "EV/Revenue", href: "/valuation#trading-multiples" },
  { term: "P/E", href: "/valuation#trading-multiples" },
  { term: "DCF", href: "/valuation#dcf" },
  { term: "PEG", href: "/valuation#peg" },
  { term: "EPV", href: "/valuation#epv" },
  { term: "DDM", href: "/valuation#ddm" },
];

const NARRATIVE_TOOLTIPS: Array<{ term: string; description: string }> = [
  {
    term: "terminal value",
    description: "The portion of a DCF that estimates what the business is worth beyond the explicit forecast period.",
  },
  {
    term: "terminal assumptions",
    description: "The long-run growth or exit-multiple assumptions that drive the ending value of a valuation model.",
  },
  {
    term: "exit multiple",
    description: "A valuation shortcut that estimates future value by applying a market multiple, such as EV/EBITDA, to a future financial metric.",
  },
  {
    term: "discount rate",
    description: "The return investors demand for risk; higher discount rates reduce present value.",
  },
  {
    term: "earnings power",
    description: "A view of what a company is worth based on its normalized current earning ability rather than future growth.",
  },
  {
    term: "margin convergence",
    description: "An assumption that profit margins gradually move toward a more mature or industry-normal level over time.",
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderNarrativeText(text: string, ticker: string): ReactNode[] {
  const terms = [
    ...NARRATIVE_LINKS.map((item) => item.term),
    ...NARRATIVE_TOOLTIPS.map((item) => item.term),
  ].sort((a, b) => b.length - a.length);

  if (terms.length === 0) return [text];

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.filter(Boolean).map((part, index) => {
    const normalized = part.toLowerCase();
    const link = NARRATIVE_LINKS.find((item) => item.term.toLowerCase() === normalized);
    if (link) {
      return (
        <Link
          key={`${normalized}-${index}`}
          href={`/${ticker}${link.href}`}
          className="font-medium text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary"
        >
          {part}
        </Link>
      );
    }

    const tooltip = NARRATIVE_TOOLTIPS.find((item) => item.term.toLowerCase() === normalized);
    if (tooltip) {
      return (
        <Tooltip key={`${normalized}-${index}`}>
          <TooltipTrigger className="inline font-medium underline decoration-dotted underline-offset-4 decoration-muted-foreground/60">
            {part}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-xs leading-5">
            {tooltip.description}
          </TooltipContent>
        </Tooltip>
      );
    }

    return part;
  });
}

function UpsideCell({ value }: { value: number }) {
  return (
    <td
      className={`py-2 pl-4 text-right font-mono font-semibold whitespace-nowrap ${
        value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted-foreground"
      }`}
    >
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </td>
  );
}

function ModelRow({ model, ticker }: { model: ValuationResult; ticker: string }) {
  const link = MODEL_LINKS[model.model_type];
  const href = link ? `/${ticker}${link}` : null;
  const name = MODEL_NAMES[model.model_type] ?? model.model_type;

  return (
    <tr className="border-b border-muted/20 hover:bg-muted/10">
      <td className="py-2 pr-4 pl-8 text-muted-foreground whitespace-nowrap">
        {href ? (
          <Link href={href} className="text-primary/80 hover:text-primary hover:underline">
            {name}
          </Link>
        ) : name}
      </td>
      <td className="py-2 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
        {model.fair_value > 0
          ? `${formatCurrency(model.low_estimate)} – ${formatCurrency(model.high_estimate)}`
          : "—"}
      </td>
      <td className="py-2 px-4 text-right font-mono">
        {model.fair_value > 0 ? formatCurrency(model.fair_value) : "N/A"}
      </td>
      {model.fair_value > 0 ? (
        <UpsideCell value={model.upside_percent} />
      ) : (
        <td className="py-2 pl-4 text-right text-muted-foreground">—</td>
      )}
    </tr>
  );
}

export function SummaryCard({ summary, updatedAt }: Props) {
  const { pillars } = summary;

  return (
    <div className="val-page">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="val-h2">
          {summary.company_name} ({summary.ticker}) Valuation Summary
        </h2>
        {updatedAt && (
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Updated {updatedAt}
          </span>
        )}
      </div>

      <Card className="p-4 sm:p-6 space-y-4">
        {ENABLE_AI_NARRATIVE && summary.narrative && (
          <TooltipProvider>
            <div className="space-y-6 pb-4">
              <div className="space-y-2">
                <h3 className="val-ai-heading">
                  AI Quick Take
                </h3>
                <p className="val-ai-body">
                  {renderNarrativeText(summary.narrative.quick_take, summary.ticker)}
                </p>
              </div>
              {summary.narrative.full_narrative && (
                <div className="space-y-2">
                  <h3 className="val-ai-heading">
                    AI Valuation Interpretation
                  </h3>
                  <p className="val-ai-body">
                    {renderNarrativeText(summary.narrative.full_narrative, summary.ticker)}
                  </p>
                </div>
              )}
            </div>
          </TooltipProvider>
        )}

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b-2 border-brand/40">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Model</th>
                <th className="text-right py-2 px-4 font-medium text-muted-foreground">Range</th>
                <th className="text-right py-2 px-4 font-medium text-muted-foreground">Fair Value</th>
                <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Upside</th>
              </tr>
            </thead>
            <tbody>
              {PILLAR_CONFIG.map((cfg) => {
                const pillar = pillars[cfg.key];
                if (!pillar?.models?.length) return null;

                return (
                  <PillarGroup
                    key={cfg.key}
                    label={cfg.label}
                    link={`/${summary.ticker}${cfg.link}`}
                    models={pillar.models}
                    ticker={summary.ticker}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --- Pillar group row + child model rows ---
function PillarGroup({
  label, link, models, ticker,
}: {
  label: string;
  link: string;
  models: ValuationResult[];
  ticker: string;
}) {
  return (
    <>
      {/* Pillar header row */}
      <tr className="bg-muted/30 border-b border-muted/40">
        <td className="py-2.5 pr-4 font-semibold whitespace-nowrap">
          <Link href={link} className="text-primary hover:underline">
            ▸ {label}
          </Link>
        </td>
        <td className="py-2.5 px-4" />
        <td className="py-2.5 px-4" />
        <td className="py-2.5 pl-4" />
      </tr>
      {/* Child model rows — filtered to known models, sorted by preferred display order */}
      {[...models].filter(m => m.model_type in MODEL_NAMES).sort((a, b) => {
        const ai = MODEL_ORDER.indexOf(a.model_type);
        const bi = MODEL_ORDER.indexOf(b.model_type);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }).map(model => (
        <ModelRow
          key={model.model_type}
          model={model}
          ticker={ticker}
        />
      ))}
    </>
  );
}
