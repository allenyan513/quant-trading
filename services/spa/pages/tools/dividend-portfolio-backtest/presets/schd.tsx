/**
 * Editorial body for /tools/dividend-portfolio-backtest/schd.
 *
 * Single-fund shape. The risk here is writing something an ETF data site already
 * says better, so this page stays on what the BACKTEST shows — reinvested versus
 * cash, income growth, yield on cost, drawdown — rather than restating a fact
 * sheet.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function SchdCopy() {
  return (
    <>
      <Section title="What you are actually backtesting">
        <P>
          SCHD tracks the Dow Jones U.S. Dividend 100 index. A company has to have paid a dividend for ten consecutive years just to be
          considered; the ones that qualify are then ranked on cash flow to total debt, return on equity, dividend yield and five-year
          dividend growth, and roughly the best hundred are held. It costs 0.06% a year.
        </P>
        <P>
          Two things follow from that. First, this is not a high-yield fund in the naive sense — the screen deliberately passes over
          companies whose yield is high because the price collapsed. Second, it is concentrated: a hundred names, with sector weights that
          drift toward energy, consumer staples and healthcare as a by-product of the ranking rather than by design. That concentration is
          the risk you are taking in exchange for the quality filter.
        </P>
      </Section>

      <Section title="Reinvested versus taken as cash">
        <P>
          The two lines on the chart above are the same fund with one decision changed. The upper line buys more shares with every
          dividend at that day&apos;s close. The lower one leaves the cash idle, earning nothing — a deliberately unflattering floor,
          because real cash usually earns something, and the gap between the lines is the honest maximum that reinvestment was worth.
        </P>
        <P>
          Over a decade that gap gets large, and not because the fund did anything different. Reinvested shares collect the next dividend,
          which buys more shares, which collect the one after. That is the entire mechanism, and it is why the reinvested income column
          climbs faster than the fund&apos;s own dividend growth rate.
        </P>
      </Section>


      <Section title="What this backtest does not tell you">
        <P>
          It is gross of tax. SCHD&apos;s distributions are largely qualified dividends, but in a taxable account you paid something on
          them every year, and reinvesting the after-tax remainder compounds more slowly than the line above. In a tax-advantaged account
          the chart is closer to what you got.
        </P>
        <P>
          It is also one path. A ten-year window that starts at a different point produces a different answer, and a fund built on a
          quality screen tends to look best in the stretches where quality was rewarded. Move the start date and see how much the
          conclusion moves with it — that sensitivity is itself information.
        </P>
        <P>
          Compare it against something:{" "}
          <Link href="/tools/dividend-portfolio-backtest/schd-vs-vym" style={{ color: "var(--accent)" }}>
            SCHD vs VYM
          </Link>{" "}
          or{" "}
          <Link href="/tools/dividend-portfolio-backtest/jepi-vs-schd" style={{ color: "var(--accent)" }}>
            JEPI vs SCHD
          </Link>
          .
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Index methodology and expense ratio from Schwab Asset Management&apos;s SCHD documentation and S&amp;P Dow Jones Indices&apos;
          published rules for the Dow Jones U.S. Dividend 100. Prices and dividend history from Financial Modeling Prep&apos;s end-of-day
          feed.
        </P>
      </Section>
    </>
  );
}
