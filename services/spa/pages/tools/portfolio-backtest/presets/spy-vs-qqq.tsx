/**
 * Editorial body for /tools/portfolio-backtest/compare/spy-vs-qqq.
 *
 * This SERP is entirely tool sites quoting different numbers for the same
 * question, because they use different windows. That discrepancy IS our angle —
 * we can demonstrate it rather than assert it.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function SpyVsQqqCopy() {
  return (
    <>
      <Section title="Same question, different windows, opposite answers">
        <P>
          Look up this comparison anywhere and you will find drawdowns quoted at over 80% for QQQ and over 50% for SPY. Over the ten years
          measured above, both fell far less. Nobody is lying: those larger figures are since-inception, and QQQ&apos;s includes the
          dot-com collapse, when it lost roughly four-fifths of its value.
        </P>
        <P>
          That gap is the most useful thing on this page. A fund comparison is not a fact about the funds — it is a fact about the funds
          <em> over a chosen stretch of history</em>, and the choosing is doing more work than most write-ups admit. Change the start date
          in{" "}
          <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>
            the full tool
          </Link>{" "}
          and see how far the ranking moves.
        </P>
      </Section>

      <Section title="They are less different than they look">
        <P>
          QQQ&apos;s largest holdings are also SPY&apos;s largest holdings. Market-cap weighting concentrates the S&amp;P 500 into the same
          mega-caps that dominate the Nasdaq 100, so the two funds have moved together far more often than their descriptions suggest. The
          difference is one of degree: QQQ holds a hundred names and no financials, SPY holds five hundred across every sector.
        </P>
        <P>
          Practically, that means owning both is closer to owning a leveraged position in a dozen companies than to diversifying. Run each
          one alone and compare against the blend before assuming otherwise.
        </P>
      </Section>

      <Section title="What to look at above">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>CAGR</strong> for the headline, but read it next to volatility and drawdown — the two
            funds did not deliver their returns on the same terms.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Max drawdown</strong> on daily closes, which is what you would have watched happen,
            not the smoothed month-end version.
          </li>
          <li>
            Dividends barely register for either fund, so they are summarized in one line rather than broken out. If income is what you are
            after, the{" "}
            <Link href="/tools/portfolio-backtest/dividend" style={{ color: "var(--accent)" }}>
              dividend basket
            </Link>{" "}
            is the more useful page.
          </li>
        </Ul>
      </Section>

      <Section title="Sources">
        <P>
          Index rules and expense ratios from State Street&apos;s and Invesco&apos;s fund documentation. Prices and dividend history from
          Financial Modeling Prep&apos;s end-of-day feed.
        </P>
      </Section>
    </>
  );
}
