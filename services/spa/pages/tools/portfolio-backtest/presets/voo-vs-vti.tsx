/**
 * Editorial body for /tools/portfolio-backtest/compare/voo-vs-vti.
 *
 * A comparison whose honest answer is "barely anything" — which is a useful
 * finding, and the page is written to deliver it rather than manufacture drama.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function VooVsVtiCopy() {
  return (
    <>
      <Section title="Why 3,000 extra companies change so little">
        <P>
          VTI holds roughly seven times as many companies as VOO. It also weights them by market value, and the companies VOO already
          owns are the large ones — so the thousands of additional names enter at very small weights and move the aggregate far less than
          their count suggests.
        </P>
        <P>
          That is the mechanism behind two curves that sit almost on top of each other. It is not a coincidence of this particular decade;
          it follows from cap-weighting.
        </P>
      </Section>

      <Section title="What actually differs">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>Coverage.</strong> The S&amp;P 500 versus essentially the whole US market, including
            mid and small caps.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Selection rules.</strong> The S&amp;P 500 is chosen by a committee against published
            criteria; the CRSP total-market index is mechanical.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Not the fee.</strong> Both charge 0.03%, so the usual tiebreaker does not apply here.
          </li>
        </Ul>
      </Section>

      <Section title="Holding both mostly buys overlap">
        <P>
          Every company in VOO is already inside VTI. Owning both does not diversify — it re-weights, tilting the combined position back
          toward large caps. If that is the intent it can be done deliberately with weights in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link>; if it is not, the two funds are
          closer to alternatives than to complements.
        </P>
      </Section>

      <Section title="Sources">
        <P>
          Index, holdings count, expense ratio and inception from Vanguard&apos;s fund documentation, cross-checked against Financial
          Modeling Prep&apos;s ETF reference data. Both columns are independent backtests with dividends reinvested.
        </P>
      </Section>
    </>
  );
}
