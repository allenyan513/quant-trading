/**
 * Editorial body for /tools/portfolio-backtest/sixty-forty.
 *
 * The allocation's whole argument is the drawdown row, not the return row — so
 * that is what this page points at.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function SixtyFortyCopy() {
  return (
    <>
      <Section title="The bonds are not there to make money">
        <P>
          Judge this portfolio by its maximum drawdown, not its return. Forty percent in investment-grade bonds is expected to cost
          something in a rising stock market; what it buys is a shallower hole in a falling one, and the drawdown row below is the entire
          case for the allocation stated as a number.
        </P>
        <P>
          Open one of the all-stock pages on this site alongside this one and compare only that row. The return difference is the price of
          the drawdown difference.
        </P>
      </Section>

      <Section title="Not rebalanced — so it is not 60/40 by the end">
        <P>
          This is a buy-and-hold test: bought once at sixty-forty and never touched. Across a long stretch of rising stock prices the
          equity share grows steadily, so the mix carrying the last few years is meaningfully more aggressive than the one it started
          with.
        </P>
        <P>
          That is worth knowing before reading the risk figures, because a genuinely rebalanced 60/40 would have sold stocks into strength
          and held a steadier profile throughout.
        </P>
      </Section>

      <Section title="Why the window starts in 2007">
        <P>
          BND launched in April 2007, and the test only runs over dates every holding actually has prices. So the window begins there and
          says so, rather than extending a bond series backwards into years it did not exist. It happens to be a useful starting point:
          the stretch that follows immediately contains the deepest equity drawdown in the series.
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Fund facts from Vanguard&apos;s BND and SPDR&apos;s SPY documentation. Prices are split-adjusted end-of-day closes; BND&apos;s
          monthly distributions are reinvested on their ex-dates exactly like a stock dividend. Change the split in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link>.
        </P>
      </Section>
    </>
  );
}
