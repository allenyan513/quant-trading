/**
 * Editorial body for /tools/portfolio-backtest/spy.
 *
 * The risk on a single-fund page for the most-written-about ETF in the world is
 * thin content. The angle that is ours: what the DAILY-bar backtest shows that a
 * fact sheet does not — the real drawdown, and how much of the return was dividends.
 */
import Link from "@/components/link";
import { Section, P } from "@/components/public-chrome";

export default function SpyCopy() {
  return (
    <>
      <Section title="The dividend part nobody quotes">
        <P>
          SPY is discussed almost entirely in terms of price. Its yield is low enough that most summaries round it away — and then quote a
          ten-year return that quietly includes it anyway. The summary above separates the two, so you can see what share of the gain
          actually came from dividends rather than from the index rising.
        </P>
        <P>
          It is a smaller share than a dividend fund&apos;s, and it is still not nothing. Reinvested over a decade, a sub-one-and-a-half
          percent yield compounds into a real slice of the ending balance. That is the case for reinvesting even when income is not why you
          bought the fund.
        </P>
      </Section>

      <Section title="Why this drawdown looks different">
        <P>
          The maximum drawdown here is measured on daily closes, so it is the worst peak-to-trough you actually sat through. Month-end data
          smooths away the sharpest days and reports a gentler number — which is the version most comparison sites publish.
        </P>
        <P>
          You will also see much larger figures quoted elsewhere, sometimes over 50%. Those are since-inception: SPY dates to 1993 and has
          been through two crashes that fall outside a ten-year window. Neither figure is wrong. They answer different questions, and the
          window is doing most of the work in the answer.
        </P>
      </Section>

      <Section title="What SPY is, mechanically">
        <P>
          It tracks the S&amp;P 500 — the largest US companies weighted by market capitalization — and charges 0.09% a year. Market-cap
          weighting means the fund is more concentrated than &ldquo;500 companies&rdquo; suggests: the largest handful carry a
          disproportionate share, so SPY&apos;s recent history has leaned heavily on the same names that drive{" "}
          <Link href="/tools/portfolio-backtest/qqq" style={{ color: "var(--accent)" }}>
            QQQ
          </Link>
          .
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Index and expense ratio from State Street&apos;s SPY documentation. Prices and dividend history from Financial Modeling
          Prep&apos;s end-of-day feed.
        </P>
      </Section>
    </>
  );
}
