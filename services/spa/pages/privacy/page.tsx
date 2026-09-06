/**
 * Privacy — a factual description of what this system actually stores, checked
 * against the schema and the request path rather than adapted from a template.
 *
 * If the code changes, this page changes with it. The claims that must stay true:
 * no third-party analytics or tracking scripts anywhere in the SPA; the public
 * tools store nothing; `auth_session` does record IP + user agent; the IBKR Flex
 * token is encrypted at rest (`encryptSecret`); app access logs carry no IP.
 */
import { useEffect } from "react";
import { ProsePage, Section, P, Ul, MailLink } from "@/components/public-chrome";
import { applySeo, PRIVACY_SEO } from "@/lib/seo";

export default function PrivacyPage() {
  useEffect(() => applySeo(PRIVACY_SEO), []);

  return (
    <ProsePage
      title="Privacy Policy"
      intro={
        <>
          Short version: the free tools need no account and store nothing about you. There are no analytics, no tracking pixels and no
          advertising scripts anywhere on this site. If you create an account, we keep the minimum needed to run it.
        </>
      }
    >
      <Section title="Using the free tools">
        <P>
          Running a backtest sends the tickers, weights, dates and starting amount you entered to our API so it can be computed. That input
          is not stored, not linked to you, and not shared. Your browser&apos;s IP address is used in memory for a few seconds to enforce a
          rate limit on the endpoint, and is not written to any database.
        </P>
        <P>
          Results are encoded in the page URL so you can share or re-open them. That URL is created by your browser; we do not record which
          URLs are generated or shared.
        </P>
      </Section>

      <Section title="If you create an account">
        <Ul>
          <li>Your name and email address.</li>
          <li>A hashed password, or — if you sign in with Google — the tokens Google issues for that connection. We never see your Google password.</li>
          <li>
            Session records, which include the IP address and browser user-agent of the sign-in. These exist so you can see and revoke
            active sessions, and so unusual activity is detectable.
          </li>
          <li>The content you create in the workspace: watchlists, memos, paper-trading orders and positions.</li>
        </Ul>
      </Section>

      <Section title="If you connect a brokerage account">
        <P>
          Connecting Interactive Brokers is optional. You supply a Flex Query token, which is <strong style={{ color: "var(--text)" }}>encrypted before it is stored</strong>{" "}
          and used only to fetch your holdings, trades and account value. The connection is read-only: it cannot place, modify or cancel an
          order. Removing the connection deletes the stored token.
        </P>
      </Section>

      <Section title="If you connect the MCP connector">
        <P>
          The connector lets an AI assistant you control — your Claude — read your data through an OAuth-authorized token. Requests are
          scoped to your own account: the user identity is taken from the token, never from anything the client sends. What your assistant
          then does with that data is governed by your relationship with its provider, not by this policy.
        </P>
      </Section>

      <Section title="Cookies">
        <P>
          One cookie: the session cookie that keeps you signed in. It is not used for tracking, profiling or advertising, and it is not set
          before you sign in. There are no third-party cookies, no analytics and no tag managers on this site, which is also why you are not
          being asked to accept a cookie banner.
        </P>
      </Section>

      <Section title="Who else processes data">
        <Ul>
          <li>
            <strong style={{ color: "var(--text)" }}>Cloudflare</strong> — serves this website and its static files.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Google Cloud (Cloud Run)</strong> — runs the API.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Neon</strong> — hosts the Postgres database.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Google</strong> — only if you choose to sign in with Google.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Financial Modeling Prep</strong> and <strong style={{ color: "var(--text)" }}>SEC EDGAR</strong> —
            market and filing data. We send them ticker symbols and date ranges. They receive nothing about you.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Anthropic</strong> — used by internal features that classify news. Your account data is
            not sent to it.
          </li>
        </Ul>
        <P>
          Like any hosted service, these providers keep their own infrastructure logs, which can include IP addresses. That is outside our
          control and governed by their policies.
        </P>
      </Section>

      <Section title="Our own logs">
        <P>
          The API records the method, path, response status and duration of each request — enough to spot an outage or a broken endpoint.
          These logs do not contain IP addresses and are not stored in the database.
        </P>
      </Section>

      <Section title="Retention and deletion">
        <P>
          Account data is kept while the account exists. Email <MailLink /> from the address on the account and we will delete it, along with
          the watchlists, memos, paper-trading records and any stored brokerage token attached to it. You can also ask for a copy of what is
          stored about you.
        </P>
      </Section>

      <Section title="Selling data">
        <P>We do not sell your data, rent it, or share it with advertisers. There are no advertisers.</P>
      </Section>

      <Section title="Children">
        <P>This site is not directed at children and accounts are not knowingly created for anyone under 16.</P>
      </Section>

      <Section title="Changes">
        <P>
          If this policy changes in a way that affects what is collected or who processes it, the date at the top of this page changes and
          the previous version stays in the public repository&apos;s history.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions about this policy, or a request about your data: <MailLink />.
        </P>
      </Section>
    </ProsePage>
  );
}
