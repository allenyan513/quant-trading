---
title: Total return vs price return: what a stock chart leaves out
description: A price chart ignores dividends, so an income fund can look like it went nowhere for a decade. Here is what total return counts instead, and when the gap matters.
date: 2026-09-06
tags: [dividends, basics]
---

Pull up almost any stock chart and you are looking at **price return**: where the last trade printed, and nothing else. It is the number every app shows by default, and for a company that has never paid a dividend it is the whole story.

For anything that pays you along the way, it is not. A fund yielding three percent hands you three percent of your money each year and — this is the part people miss — its price drops by roughly that amount on the ex-dividend date. The cash left the fund; the chart records the exit and never records the arrival in your account. Do that for ten years and the chart is missing about a third of what you actually earned.

## The two numbers

**Price return** answers: what is one share worth now versus then?

**Total return** answers: what is my money worth now versus then, if every dividend went back into more shares?

The second question is the one you were actually asking. It is also the one that makes assets comparable — otherwise you are holding a growth fund's full result against an income fund's partial one and calling the growth fund a winner.

## Where the gap is large enough to change a decision

The gap is not a rounding error, and it is not uniform:

- **High-yield equity funds and REITs.** Most of the return arrives as cash. Judge these on price and you will conclude they are dead money, which is precisely backwards.
- **Broad market index funds.** A couple of percent a year, compounding. Over twenty years that is a large multiple, not a footnote.
- **Growth and non-payers.** Almost no gap. Price return and total return say close to the same thing.

That last case is why the mistake survives: for the assets people talk about most, the two numbers nearly agree, so nobody learns to ask which one they are looking at.

## Reinvested is not the same as spent

Total return normally assumes every dividend buys more shares. That is an assumption, not a fact about your life. If you are living off the income, you got the cash and did not get the compounding, and your result is somewhere between the two lines.

Both are worth seeing side by side, which is why our [portfolio backtest](/tools/portfolio-backtest) computes them together — the same holdings, dividends reinvested and dividends taken as cash, on daily split-adjusted prices. [SCHD on its own](/tools/portfolio-backtest/schd) shows the gap on a fund built for income; [SCHD vs VYM](/tools/portfolio-backtest/compare/schd-vs-vym) shows that two funds with similar yields can still separate on total return, because yield is not the same as return.

## What to check before you trust a comparison

1. **Is it total return?** If the source does not say, assume price and treat the income fund's number as understated.
2. **Reinvested or paid out?** Both are legitimate; they answer different questions.
3. **Same window for everything?** A fund that launched in 2020 cannot be compared over twenty years, and quietly starting its line later flatters or damns it depending on what 2020 to 2022 did.
4. **Gross or net?** Backtests here are gross: no dividend withholding tax, no commissions. Your taxable account will do worse, and by an amount that depends on where you live.

None of this makes dividends magic. A dollar paid out is a dollar no longer in the share price, and the reason to prefer an income strategy is behavioural or structural, not arithmetic. But you cannot make that judgement at all while the chart you are reading is quietly leaving out the cash.

Start from the [ready-made dividend basket](/tools/portfolio-backtest/dividend), or type in the tickers you actually hold.
