/**
 * Terms of Use — plain language, and deliberately not corporate boilerplate: this
 * is a free tool run by one person, and claiming otherwise would be both untrue
 * and less defensible. The financial disclaimers are the substantive part.
 */
import { useEffect } from "react";
import { ProsePage, Section, P, Ul, MailLink } from "@/components/public-chrome";
import { applySeo, TERMS_SEO } from "@/lib/seo";

export default function TermsPage() {
  useEffect(() => applySeo(TERMS_SEO), []);

  return (
    <ProsePage
      title="Terms of Use"
      intro={
        <>
          SweetValueLab is a research and educational tool, operated independently by one person and offered free of charge. Using the site
          means accepting what follows — most importantly, that nothing here is investment advice.
        </>
      }
    >
      <Section title="This is not investment advice">
        <P>
          Nothing on this site is a recommendation to buy, sell or hold any security. SweetValueLab is not a broker-dealer, not a registered
          investment adviser, and not your fiduciary. The tools compute historical figures from public data; deciding what to do with them
          is entirely yours, and you bear the results.
        </P>
      </Section>

      <Section title="Backtests are hypothetical">
        <P>
          A backtest applies today&apos;s rules to yesterday&apos;s prices with perfect hindsight and no friction. Every result on this site
          excludes taxes, withholding, commissions, spreads, slippage and fund fees not already embedded in a price. Real accounts do worse.
          Past performance does not predict future results.
        </P>
      </Section>

      <Section title="Data can be wrong">
        <P>
          Market and filing data is sourced from third parties and from the SEC. It can be delayed, incomplete, or plainly incorrect —
          missing dividends, unadjusted splits and mislabeled dates all happen. Every figure is provided as-is, with no warranty of accuracy,
          completeness or fitness for any purpose. Verify anything you intend to act on. If you find a discrepancy, tell us — that is the
          most useful email we can get.
        </P>
      </Section>

      <Section title="Fair use">
        <Ul>
          <li>Use the public tools as a person would: automated hammering, scraping at volume and attempts to bypass rate limits are not allowed.</li>
          <li>Do not resell or redistribute the underlying market data — we license it for this service, not for onward distribution.</li>
          <li>Do not use the site to break the law, or the terms of the data sources it depends on.</li>
          <li>If you have an account, you are responsible for what happens under it, and for keeping your credentials safe.</li>
        </Ul>
        <P>Access that damages the service or degrades it for others may be blocked or suspended.</P>
      </Section>

      <Section title="Connected brokerage accounts">
        <P>
          If you connect Interactive Brokers, the connection is read-only and exists to display your own holdings. You supply the token, you
          can revoke it at any time from your broker, and you remain responsible for every order you place there. Paper trading on this site
          is simulated and moves no money.
        </P>
      </Section>

      <Section title="Availability">
        <P>
          This is a free service with no uptime guarantee. Features may change or be removed, and the service may be suspended or
          discontinued. If it shuts down, reasonable notice will be given so you can export anything you care about.
        </P>
      </Section>

      <Section title="Liability">
        <P>
          To the fullest extent permitted by law, the operator is not liable for any trading loss, lost profit, or other damage arising from
          use of this site, its data, or its unavailability. If you are not comfortable with that, do not rely on this site.
        </P>
      </Section>

      <Section title="Changes">
        <P>These terms may change; the date at the top of this page reflects the last revision. Continued use means the new version applies.</P>
      </Section>

      <Section title="Contact">
        <P>
          Questions about these terms: <MailLink />.
        </P>
      </Section>
    </ProsePage>
  );
}
