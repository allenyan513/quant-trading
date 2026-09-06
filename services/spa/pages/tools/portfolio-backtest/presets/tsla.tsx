/**
 * Editorial body for /tools/portfolio-backtest/tsla.
 *
 * Tesla pays nothing, which makes it the cleanest teaching case on the site for
 * what "total return" means when none of it is income.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function TslaCopy() {
  return (
    <>
      <Section title="A backtest with nothing to reinvest">
        <P>
          Tesla has never paid a dividend. That makes this page unusually clean: the two lines the chart normally separates — dividends
          reinvested and dividends taken as cash — sit exactly on top of each other, because there were no dividends to take either way.
          Every dollar of the result is price.
        </P>
        <P>
          It is worth seeing once. On the dividend pages elsewhere here, the gap between those two lines is the whole point; on this page
          its absence is.
        </P>
      </Section>

      <Section title="Volatility is the number to read first">
        <P>
          The annualized volatility below is computed from daily returns of a single company. An index fund averages thousands of daily
          moves against one another and lands somewhere calm; one stock does not, and Tesla has been among the more volatile large caps
          for its entire listed life.
        </P>
        <P>
          Pair it with the maximum drawdown. Together they describe the experience of holding this position, which the annualized return
          on its own quietly omits.
        </P>
      </Section>

      <Section title="Two splits inside this window">
        <P>
          Tesla split 5-for-1 in August 2020 and 3-for-1 in August 2022. Both are handled by adjustment rather than appearing as drops,
          so the share count reported at the end is on today&apos;s basis. Comparing a pre-2020 share price to a current one without that
          adjustment is the most common way this stock gets misquoted.
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Listing date, sector and split history from Financial Modeling Prep&apos;s company profile and corporate-actions feeds. Prices
          are split-adjusted end-of-day closes. Try a different window or a blend with other names in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link>.
        </P>
      </Section>
    </>
  );
}
