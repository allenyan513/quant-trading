/**
 * Editorial body for /tools/portfolio-backtest/magnificent-7.
 *
 * Two things make this page more than a label: it is never rebalanced, so the
 * weights drift enormously; and the benchmark already holds the same names.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function MagnificentSevenCopy() {
  return (
    <>
      <Section title="Equal weight at the start, nothing like it at the end">
        <P>
          The basket is bought once in seven equal slices and then left alone. No rebalancing means the winners compound into a larger
          and larger share of the portfolio, so by the end the position is heavily tilted toward whichever names ran hardest.
        </P>
        <P>
          The per-holding table below is the honest picture of that drift. A rebalanced version of this portfolio would have trimmed the
          leaders every year and produced a different — usually calmer, often smaller — result.
        </P>
      </Section>

      <Section title="The benchmark is not independent">
        <P>
          All seven names sit inside the S&amp;P 500, and between them they account for a large share of it. The grey line is therefore
          not a clean control: a big part of what it earned came from the same seven companies, held at market-cap weight alongside
          hundreds of others.
        </P>
        <P>
          What the gap really measures is concentration — the same bets, sized differently. The drawdown row is where that sizing shows up
          as a cost.
        </P>
      </Section>

      <Section title="The name is a label applied afterwards">
        <Ul>
          <li>
            These seven were grouped <em>because</em> they had already outperformed. Any test of them over the period that earned them the
            label is measuring the selection, not a strategy.
          </li>
          <li>
            Two of them — Amazon and Tesla — pay no dividend at all, so the income figures here come from the other five and the result
            says which contributed nothing.
          </li>
          <li>
            Change the members or the weights in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link> and the conclusion moves. If dropping one name changes the answer materially, the
            portfolio was a bet on that name.
          </li>
        </Ul>
      </Section>

      <Section title="Sources">
        <P>
          Company facts from Financial Modeling Prep&apos;s profile feed. Prices are split-adjusted end-of-day closes; each holding&apos;s
          dividends are applied on its own ex-dates and reinvested.
        </P>
      </Section>
    </>
  );
}
