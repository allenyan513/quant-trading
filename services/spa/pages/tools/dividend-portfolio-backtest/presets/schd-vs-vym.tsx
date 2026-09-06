/**
 * Editorial body for /tools/dividend-portfolio-backtest/schd-vs-vym.
 *
 * Written to stand on its own: the backtest numbers arrive client-side, so this
 * copy IS the page as far as a crawler is concerned. Deliberately qualitative —
 * fund facts that don't move (index rules, expense ratios, how many holdings the
 * methodology produces), never return figures, which would be stale the day after
 * they were written and would contradict the live table above them.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function SchdVsVymCopy() {
  return (
    <>
      <Section title="The names are misleading">
        <P>
          VYM is the fund called &ldquo;High Dividend Yield.&rdquo; SCHD is the one that has recently paid the higher yield. That
          inversion is the whole story of these two ETFs, and it comes straight out of how their indexes are written.
        </P>
        <P>
          VYM tracks the FTSE High Dividend Yield index, which ranks US dividend payers by forecast yield, takes the higher-paying half,
          and weights them by market capitalization. &ldquo;Half the market&rdquo; is a wide net — several hundred companies — and
          market-cap weighting then pushes the money toward the largest of them, which are rarely the highest yielders. The result is a
          broad, cheap, large-cap-tilted fund whose yield is dragged toward the market average by its own weighting scheme.
        </P>
        <P>
          SCHD tracks the Dow Jones U.S. Dividend 100. To be eligible a company needs ten consecutive years of dividends; survivors are
          then ranked on cash flow to total debt, return on equity, dividend yield and five-year dividend growth. Only about a hundred
          names make it. The screen is looking for companies that can keep paying, not simply companies paying a lot today — and by
          filtering out the largest low-yield names it ends up with the higher payout of the two.
        </P>
      </Section>

      <Section title="What that does to the portfolios">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>Concentration.</strong> Roughly 100 holdings against several hundred. SCHD&apos;s
            top names carry real weight; VYM&apos;s tail is long and thin. Concentration is the price SCHD pays for its screen.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Sector shape.</strong> The quality-and-yield screen keeps steering SCHD toward
            energy, consumer staples and healthcare, while VYM&apos;s market-cap weighting leaves it heavier in financials and
            large-cap technology. In any given stretch, most of the performance gap between the two is this, not stock picking.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Cost.</strong> Both are cheap enough that fees are not the deciding factor —
            0.06% a year for SCHD, 0.04% for VYM.
          </li>
        </Ul>
      </Section>



      <Section title="Sources">
        <P>
          Index rules and expense ratios from the fund issuers&apos; own documentation (Schwab Asset Management for SCHD, Vanguard for
          VYM). Prices and dividend history from Financial Modeling Prep&apos;s end-of-day feed.
        </P>
      </Section>
    </>
  );
}
