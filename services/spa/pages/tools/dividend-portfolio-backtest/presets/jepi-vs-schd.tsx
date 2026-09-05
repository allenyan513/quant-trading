/**
 * Editorial body for /tools/dividend-portfolio-backtest/jepi-vs-schd.
 *
 * The angle this page exists for: JEPI's payout is option premium, not dividends,
 * so it falls when volatility falls. The income-by-year and dividend-cuts tables
 * on this site show that directly — which the price-comparison pages that
 * dominate this query cannot.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function JepiVsSchdCopy() {
  return (
    <>
      <Section title="These two are not the same kind of fund">
        <P>
          Comparing JEPI and SCHD on yield is comparing two different things that both arrive as cash in your account. SCHD passes through
          the dividends its holdings declare. JEPI mostly passes through option premium, and that distinction drives everything else on
          this page.
        </P>
        <P>
          JEPI runs an actively managed portfolio of defensive US large caps and then sells call options on the S&amp;P 500 — held through
          equity-linked notes — and distributes the premium monthly. Selling those calls caps how much of a rally the fund keeps. That is
          the trade: a large, immediate payout in exchange for the top end of the upside. It launched in May 2020 and charges 0.35% a
          year, several times SCHD&apos;s 0.06%, because someone is actively managing both the equity sleeve and the options.
        </P>
        <P>
          SCHD is a rules-based index fund. It holds about a hundred US companies that have paid dividends for at least ten straight years
          and score well on cash flow to debt, return on equity, yield and five-year dividend growth. Its payout is whatever those
          companies decide to pay, and their long-run habit is to raise it.
        </P>
      </Section>

      <Section title="Why JEPI's distribution moves the way it does">
        <P>
          Option premium is priced off volatility. When markets are turbulent, calls are expensive, and JEPI collects more; when markets
          are calm, premium shrinks and the distribution shrinks with it. So JEPI&apos;s payout can fall sharply in a year when nothing
          went wrong at any company it owns.
        </P>
        <P>
          This is worth being precise about, because the dividend-cuts table above will flag those declines. For an operating company a
          dividend cut is a signal — management ran out of room. For JEPI it is the mechanism working as designed. Both are real
          reductions in the cash you received; only one tells you something about the underlying business.
        </P>
      </Section>

      <Section title="What to look at in the results above">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>Income by year.</strong> This is the point of the comparison. One of these funds
            front-loads income; the other grows it. Ten years would show that clearly — five is enough to see the shape.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Total return with dividends reinvested.</strong> A high distribution is not a
            return. If a fund pays 8% and the price drifts down, you funded your own income. The reinvested line settles that.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Max drawdown.</strong> Selling calls dampens the downside a little, because the
            premium keeps coming in. Whether it dampened it enough to matter is in the number.
          </li>
        </Ul>
      </Section>

      <Section title="Why this window starts in 2020">
        <P>
          JEPI has no history before May 2020, and this tool refuses to test holdings over different lengths of history — every backtest
          starts on the earliest date all of its holdings had prices, and says so. A five-year window that includes 2022 is not a bad
          sample for this pair: it contains one genuine bear market and one high-volatility stretch, which is when a covered-call fund is
          supposed to earn its keep.
        </P>
        <P>
          Just be careful about generalizing. Five years is one regime, and the option-selling trade is regime-dependent by construction.
        </P>
      </Section>

      <Section title="Who each one is for">
        <P>
          If you are spending the distribution now — you are retired, the cash pays bills — the immediacy of JEPI&apos;s payout is the
          product, and the capped upside may be an acceptable price. If you are still accumulating and reinvesting, a growing dividend
          stream compounds in a way a capped one cannot, and the higher fee comes out of that compounding every year.
        </P>
        <P>
          To test a blend, or either one against something else, use{" "}
          <Link href="/tools/dividend-portfolio-backtest" style={{ color: "var(--accent)" }}>
            the full backtest tool
          </Link>
          .
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Fund structure, inception date and expense ratios from J.P. Morgan Asset Management&apos;s JEPI documentation and Schwab Asset
          Management&apos;s SCHD documentation. Prices and distribution history from Financial Modeling Prep&apos;s end-of-day feed.
        </P>
      </Section>
    </>
  );
}
