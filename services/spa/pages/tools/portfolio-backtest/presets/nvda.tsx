/**
 * Editorial body for /tools/portfolio-backtest/nvda.
 *
 * The angle for a stock everyone already knows the answer to: the return is not
 * the finding, the two things that make it hard to have actually collected are.
 */
import Link from "@/components/link";
import { Section, P, Ul } from "@/components/public-chrome";

export default function NvdaCopy() {
  return (
    <>
      <Section title="The return is the easy part">
        <P>
          Anyone reading this page already knows NVIDIA went up. What a backtest adds is the shape of the path — and the path is where
          the story stops being comfortable. The maximum drawdown below is measured on daily closes, so it is the real peak-to-trough a
          holder sat through, not the tidier figure you get from month-end data.
        </P>
        <P>
          Read that number as a duration, not a percentage. A fall of that size takes months to happen and longer to recover, and every
          one of those days offered a reason to sell.
        </P>
      </Section>

      <Section title="Two splits, and why the curve has no cliffs">
        <P>
          NVIDIA split 4-for-1 in July 2021 and 10-for-1 in June 2024. On a raw price chart both look like the stock collapsed overnight.
          Prices here are split-adjusted, so the curve runs through them continuously — which is what actually happened to anyone holding
          the shares, since a split changes the share count and the price together and leaves the position untouched.
        </P>
      </Section>

      <Section title="What this page cannot tell you">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>It was chosen with hindsight.</strong> A page for the semiconductor company that did
            not work out would look very different, and nobody searches for it. Read the result knowing which company you picked and when.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>One window is one sample.</strong> Move the start date in <Link href="/tools/portfolio-backtest" style={{ color: "var(--accent)" }}>the full tool</Link> by a couple of years
            and the annualized figure moves a long way. That sensitivity is a property of a single volatile stock, not a flaw in the test.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Dividends are noise here.</strong> The payout exists but is negligible against the
            price move — the exact inverse of the dividend funds elsewhere on this site.
          </li>
        </Ul>
      </Section>

      <Section title="Sources">
        <P>
          Sector, listing date and split history from Financial Modeling Prep&apos;s company profile and corporate-actions feeds. Prices
          are their split-adjusted end-of-day closes.
        </P>
      </Section>
    </>
  );
}
