/**
 * How the backtest works, in two sizes.
 *
 * `full` is the tool page's complete method. `brief` is what every PRESET page
 * gets — deliberately three cards plus a link, not all seven.
 *
 * That is the single most important anti-thin-content decision on this surface:
 * repeating seven identical methodology cards across every preset would make the
 * shared boilerplate dwarf each page's unique copy, which is precisely the ratio
 * that gets scaled pages filtered. The methodology is shared truth and must not
 * be reworded per page to dodge that — so ship LESS of it per preset and link to
 * the canonical explanation.
 */
import Link from "@/components/link";
import { Note } from "@/components/backtest/ui";
import { TOOL_PATH } from "@/lib/backtest-presets";

export function BacktestMethodNotes({ variant }: { variant: "full" | "brief" }) {
  if (variant === "brief") {
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22 }}>
        <Note title="Daily bars, not monthly">
              The portfolio is marked to market every trading day, so drawdowns and volatility reflect what actually happened between
              month-ends — 252 observations a year instead of 12.
            </Note>
        <Note title="Split-adjusted prices, cash dividends">
              Prices are split-adjusted closes; each dividend is applied as cash on its ex-date at the matching split-adjusted per-share
              amount. Dividend-adjusted (&ldquo;total return&rdquo;) prices are never used, so income is counted exactly once.
            </Note>
        <Note title="Buy and hold, no rebalancing">
              Weights set the opening trade and then drift, which is what a buy-and-hold holder experienced. No contributions, no rebalancing,
              no taxes, no commissions.
            </Note>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: "18px 0 0" }}>
          The window is the overlap of every holding&apos;s price history, and a dividend cut is only reported when both the annual total
          and the average payment fell.{" "}
          <Link href={TOOL_PATH} style={{ color: "var(--accent)" }}>
            Full methodology on the backtest tool
          </Link>
          .
        </p>
      </>
    );
  }
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22 }}>
      <Note title="Daily bars, not monthly">
            The portfolio is marked to market every trading day, so drawdowns and volatility reflect what actually happened between
            month-ends — 252 observations a year instead of 12.
          </Note>
      <Note title="Split-adjusted prices, cash dividends">
            Prices are split-adjusted closes; each dividend is applied as cash on its ex-date at the matching split-adjusted per-share
            amount. Dividend-adjusted (&ldquo;total return&rdquo;) prices are never used, so income is counted exactly once.
          </Note>
      <Note title="Reinvestment at the close">
            With reinvestment on, each dividend buys fractional shares at that day&apos;s close. With it off, the cash sits idle and earns
            nothing — the honest floor for the comparison.
          </Note>
      <Note title="Buy and hold, no rebalancing">
            Weights set the opening trade and then drift, which is what a buy-and-hold holder experienced. No contributions, no rebalancing,
            no taxes, no commissions.
          </Note>
      <Note title="Where the data comes from">
            Prices and dividend history come from Financial Modeling Prep&apos;s end-of-day feed. Nothing on this page is produced by a
            language model — the same inputs always give the same numbers. See <Link href="/about">About</Link> for the full source list.
          </Note>
      <Note title="The window is the overlap">
            If one holding is younger than the others, the test starts where all of them have prices — and says so, rather than quietly
            testing different lengths of history.
          </Note>
      <Note title="Cuts you actually took">
            A year counts as a cut only if both the annual total per share and the average payment fell. That keeps the real ones and drops
            the artifacts — a monthly payer with 13 ex-dates in one calendar year, or a BDC paying more in total across extra supplementals.
          </Note>
      </div>
    </>
  );
}
