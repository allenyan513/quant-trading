---
title: What a backtest cannot tell you
description: A backtest is a measurement of the past, not a forecast. Five things every historical return figure quietly assumes, and how to read one without fooling yourself.
date: 2026-09-06
tags: [backtesting, basics]
---

A backtest is a useful instrument and a terrible oracle. It measures exactly one thing well: what a fixed set of holdings would have returned over a window that has already happened. Everything people go on to conclude from that — that the strategy works, that it will keep working, that they would have held it — is added by the reader, not by the data.

Here is what the number is quietly assuming.

## 1. That you would have held on

Every backtest holds through the drawdown. You are asked to believe you would have too, having watched a third of your money disappear over eighteen months while everyone told you the regime had changed. The equity curve has no field for the month you capitulated, and that month is usually the difference between the printed result and the one you got.

Look at the depth and the *length* of the worst drawdown before you look at the return. Two years underwater is a very different experience from two months, and only one of them shows up in a CAGR.

## 2. That the past window was representative

A ten-year window ending today contains one particular sequence of rates, inflation and market leadership. Run the same holdings from 2000 to 2010 and many strategies invert. The honest reading of a strong result is "this survived this regime", not "this works".

Cheap defence: run the same basket over several windows of different lengths and start dates. If the conclusion only holds for one of them, you have found a period, not a strategy.

## 3. That you picked the holdings without hindsight

This is the big one, and it is invisible in the output. Choosing today's winners and testing them backwards is not a test — the selection already contains the answer. It is the difference between "these ten stocks did well" (true, and useless) and "a rule I could have stated in 2015 would have picked them" (a claim you can actually evaluate).

The same trap catches funds: the ones available to test are the ones that survived. The mediocre ones closed and merged away, and their records left with them.

## 4. That the frictions were zero

Backtests here are gross. No commissions, no bid-ask spread, no withholding tax on dividends, no capital gains when you rebalance. In a taxable account the tax alone can eat a meaningful part of an income strategy's edge, and it lands every year rather than at the end.

The more a strategy trades, the more the printed figure flatters it. A buy-and-hold basket loses little to frictions; something that rebalances monthly loses a great deal.

## 5. That timing was not luck

Start and end dates are levers. Move a ten-year window by six months across a crash and a "clear winner" can change places with the thing it beat. If a result depends on a specific start date, it is a fact about that date.

## So what is it good for?

Quite a lot, as long as you keep it descriptive:

- **Sizing the risk you are signing up for.** Worst drawdown, its duration, and volatility are far more stable across regimes than returns are.
- **Comparing structure, not skill.** [SPY vs QQQ](/tools/portfolio-backtest/compare/spy-vs-qqq) is a real question about concentration and sector weight — both are rules that existed before the window.
- **Seeing what dividends contributed.** Cash paid out versus reinvested is arithmetic about the past, and it is the one thing a backtest reports without any forecast hidden inside it. (See [total return vs price return](/blog/total-return-vs-price-return).)
- **Killing an idea.** A strategy that fails in-sample will not be rescued out of sample.

Our [portfolio backtest](/tools/portfolio-backtest) shows the start date it actually used, and says so out loud when a holding's history is shorter than the window you asked for — that alignment is where quiet, flattering errors usually enter. Everything it computes is history: split-adjusted daily prices and the dividends that were really paid, with no model in between.

Use it to find out what you would have lived through. Then decide separately whether you believe the next decade rhymes.
