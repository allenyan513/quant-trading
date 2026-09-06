/**
 * Editorial body for /tools/portfolio-backtest/qqq.
 *
 * The honest angle for a fund that has had a spectacular decade: the number is
 * real, and the window produced most of it. Say both.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function QqqCopy() {
  return (
    <>
      <Section title="What the index rule actually selects">
        <P>
          QQQ tracks the Nasdaq 100: the largest non-financial companies <em>listed on one exchange</em>. That is a listing rule, not an
          investment thesis — and because the companies that chose to list on Nasdaq skew heavily toward technology, the fund ends up as a
          concentrated bet on large-cap tech without ever saying so in its methodology.
        </P>
        <P>
          A hundred names, market-cap weighted, with no financials at all. Whether that is a feature depends entirely on the decade you
          hold it through.
        </P>
      </Section>

      <Section title="Read the lead against the risk">
        <Ul>
          <li>
            The <strong style={{ color: "var(--text)" }}>vs S&amp;P 500</strong> figure is the annualized difference over this window. It
            has been large. It has also been negative for multi-year stretches in the past.
          </li>
          <li>
            Compare the maximum drawdown and annualized volatility against the grey benchmark line. A concentrated fund that wins on the
            way up gives more back on the way down, and the daily-bar drawdown is where that shows.
          </li>
          <li>
            Move the start date in{" "}
            <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>
              the full tool
            </Link>{" "}
            and watch how far the conclusion travels. That sensitivity is itself the finding.
          </li>
        </Ul>
      </Section>

      <Section title="Why there is no income table here">
        <P>
          QQQ yields well under one percent. Eleven rows of small change presented as an income breakdown would imply a question nobody
          asked, so the dividends are stated once, as a share of the total gain. The same page for a dividend fund shows the full table —
          the layout follows what the data supports, not what the template offers.
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Index and expense ratio from Invesco&apos;s QQQ documentation. Prices and dividend history from Financial Modeling Prep&apos;s
          end-of-day feed.
        </P>
      </Section>
    </>
  );
}
