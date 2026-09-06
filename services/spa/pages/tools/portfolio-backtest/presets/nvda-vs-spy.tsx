/**
 * Editorial body for /tools/portfolio-backtest/compare/nvda-vs-spy.
 *
 * The comparison everyone runs. The useful reading is the risk rows, not the
 * return row — and the fact that the index already contains the stock.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function NvdaVsSpyCopy() {
  return (
    <>
      <Section title="Read the table bottom-up">
        <P>
          The return row is the one people come for and the least informative one here. Start with maximum drawdown and annualized
          volatility: those two rows describe what holding each column felt like, and they are the reason the two return figures are not
          comparable on their own.
        </P>
        <P>
          A single company and a five-hundred-company index are not two versions of the same decision. One of them can go to zero.
        </P>
      </Section>

      <Section title="The right column already contains the left one">
        <P>
          NVIDIA is a member of the S&amp;P 500, and a large one by weight. So this is not a clean independent comparison: part of what
          the SPY column earned, it earned from the stock in the other column. That overlap is worth naming, because it means the gap
          between the two is smaller than a naive reading of &ldquo;stock versus market&rdquo; suggests.
        </P>
      </Section>

      <Section title="What a page like this is for">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>Not for proving stock picking works.</strong> One company, chosen after the fact,
            over one window that suited it. The result was determined by the choice, not by the method.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>For calibrating what concentration costs.</strong> The drawdown difference is a real,
            transferable finding, and it does not depend on which stock you happened to pick.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>For testing your own pair.</strong> Any two tickers, any window, in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link>.
          </li>
        </Ul>
      </Section>

      <Section title="Sources">
        <P>
          Fund facts from SPDR&apos;s SPY documentation; company facts from Financial Modeling Prep&apos;s profile feed. Both columns are
          independent backtests on split-adjusted end-of-day closes with dividends reinvested.
        </P>
      </Section>
    </>
  );
}
