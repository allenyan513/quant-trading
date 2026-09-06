/**
 * Editorial body for /tools/portfolio-backtest/aapl.
 *
 * The twenty-year window is the point: it spans two different companies from an
 * income perspective, which no ten-year window can show.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function AaplCopy() {
  return (
    <>
      <Section title="Twenty years is two different companies">
        <P>
          Apple paid no dividend for the first stretch of this window and has paid every quarter since 2012. That single change is why
          this page uses the longest window the tool offers: a ten-year test starts after the switch and makes Apple look like it has
          always been an income stock, which it has not.
        </P>
        <P>
          The year-by-year income table below shows the gap directly — years of nothing, then a payment that starts small and grows. A
          quoted trailing yield collapses all of that into one number and hides the interesting half.
        </P>
      </Section>

      <Section title="Why the window may start later than you asked">
        <P>
          The daily price series runs a little under twenty full years. Rather than pad the difference, the test starts at the first date
          real prices exist and states that date in the result. It is a small thing, but a backtest that silently invents its earliest
          weeks is not one you should trust with the later ones.
        </P>
      </Section>

      <Section title="Three splits, one continuous curve">
        <Ul>
          <li>2-for-1 in February 2005</li>
          <li>7-for-1 in June 2014</li>
          <li>4-for-1 in August 2020</li>
        </Ul>
        <P>
          All three are adjusted away, and the dividends are matched to the same adjusted basis so per-share income stays comparable
          across them. Without that pairing, income per share would appear to collapse on each split date.
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Listing date, sector and split history from Financial Modeling Prep&apos;s company profile and corporate-actions feeds. Prices
          are split-adjusted end-of-day closes; dividends use the matching split-adjusted per-share amounts. Run your own window in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link>.
        </P>
      </Section>
    </>
  );
}
