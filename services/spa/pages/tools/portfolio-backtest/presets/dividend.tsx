/**
 * Editorial body for /tools/portfolio-backtest/dividend.
 *
 * The dividend-flavoured landing page for the general tool. Its job is the
 * approach, not two specific funds — `compare/schd-vs-vym` covers those. Keep it
 * about what an income investor should read off the tables above.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function DividendCopy() {
  return (
    <>
      <Section title="Total return is not the number you came for">
        <P>
          If you are buying dividend funds for income, the headline return is the least useful figure on this page. It tells you what the
          basket was worth at the end; it says nothing about what it paid you along the way, or whether that payment was growing.
        </P>
        <P>
          The year-by-year table is the one to read. It shows the actual dollars the basket paid each calendar year on the same starting
          amount, and the change from the year before. A fund that starts at a high yield and never raises it will lose, over a decade, to
          one that starts lower and compounds — and ten years is long enough for that crossover to show up in the column.
        </P>
      </Section>

      <Section title="Reinvested versus taken as cash">
        <Ul>
          <li>
            The upper line buys more shares with every dividend at that day&apos;s close. Those shares collect the next dividend, which
            buys more shares. That is the entire mechanism, and it is why reinvested income climbs faster than the underlying dividend
            growth rate.
          </li>
          <li>
            The lower line leaves the cash idle, earning nothing. That is deliberately unflattering — real cash usually earns something —
            so the gap between the lines is the honest <em>maximum</em> that reinvestment was worth.
          </li>
          <li>
            Yield on cost carries both effects at once: the growth in the payout and the share count you accumulated. After ten years it
            typically sits far above the funds&apos; quoted yields, and that spread is the compounding made visible.
          </li>
        </Ul>
      </Section>

      <Section title="What a dividend cut here means, and what it doesn't">
        <P>
          A fund&apos;s payout is the sum of what its holdings paid, so it moves quarter to quarter even when no company cut anything.
          Constituent turnover, ex-date timing and a rounded quarterly rate all shift the annual total by a percent or two. This tool only
          reports a cut when both the annual total per share and the average payment fell by more than five percent — enough to filter that
          noise while still catching a real reduction.
        </P>
      </Section>

      <Section title="What this leaves out">
        <P>
          Everything is gross of tax. Qualified dividends are taxed lightly in the US but not at zero, and in a taxable account you
          reinvested the after-tax remainder, which compounds more slowly than the line above. There is no rebalancing either: the weights
          set the opening trade and then drift, which is what a buy-and-hold holder actually experienced.
        </P>
        <P>
          Want different tickers or a different split?{" "}
          <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>
            The full tool
          </Link>{" "}
          takes any basket up to ten holdings.
        </P>
      </Section>

      <Section title="Sources">
        <P>Prices and dividend history from Financial Modeling Prep&apos;s end-of-day feed. Nothing here is produced by a language model.</P>
      </Section>
    </>
  );
}
