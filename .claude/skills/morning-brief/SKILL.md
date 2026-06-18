---
name: morning-brief
description: >-
  Generate the user's pre-open morning brief on their quant-trading portfolio: a
  deterministic core from the platform's OAuth MCP (their real IBKR holdings, day
  P&L, per-position return / option buffer, NAV KPIs, watchlist buy-zones) plus
  concurrent web search for live context (today's catalysts, overnight analyst
  rating / price-target changes, pre-market + macro tape). Use for "morning brief",
  "持仓早报", "持仓简报", "过一遍持仓", "开盘前看持仓", "夜盘报告", "how's my
  portfolio before the open", "pre-open briefing on my holdings" — any request to
  review the user's currently-held positions ahead of the US open, English or Chinese,
  bare phrase or full sentence. The defining signal is the user's own held positions
  plus a pre-open / overnight time frame. Requires the quant-trading MCP connector
  (OAuth) configured in this Claude. Do NOT use for generic pre-market reports not
  tied to held positions, or standalone DCF / valuation requests.
---

# Morning Brief — portfolio briefing

Generate a pre-open briefing for the user's quant-trading portfolio. There are **two
layers**: the deterministic core (facts the user owns, from the platform MCP) and the
live context (today's fast-changing world, from web search). Keep them separate — web
search adds context and narrative, it never overrides an MCP number.

> **Connection:** this skill talks to the quant-trading MCP (the connector the user
> added to their Claude via OAuth — `/api/mcp`). It exposes `get_holdings`,
> `get_watchlist`, `get_symbol_research`, and `submit_morning_brief`. If those tools
> aren't available, tell the user to add the connector from the dashboard home
> ("连接你的 Claude") and stop.

## Step 1 — Deterministic core (MCP)

Every number here is the **system of record**; never restate it from web search.

1. `get_holdings` — the structured base: per-position weight / market value / **return %**
   / quantity / option greeks + strike buffer + DTE, plus performance (NAV index, **day
   P&L**, CAGR / Sharpe / Sortino / max drawdown / beta / alpha vs SPY) and recent trades.
   Record the `as_of` date. If it reports `connected: false` or empty data, surface that
   **verbatim at the top** and tell the user to connect IBKR — don't fabricate holdings.
2. For each meaningful holding, `get_symbol_research { symbol }` — analyst ratings /
   price targets, recent news, reference valuation (fair value / upside). Batch sensibly;
   skip tiny positions when the list is long.
3. `get_watchlist` — the user's followed names with fair value / upside / verdict, for
   the "opportunities / buy-zone" section.

## Step 2 — Live context (concurrent web search)

Launch these as **parallel subagents** — one message, multiple Agent calls — so they run
concurrently and keep raw results out of the main context. Batch the holdings (~5 symbols
per subagent). Each subagent returns findings **with a source URL each**, and drops
anything it cannot source.

- **Today's catalysts** — per holding: any earnings date in the next ~7 trading days;
  plus today's high-impact US macro prints (CPI / PCE / FOMC / NFP / jobless claims).
- **Overnight analyst actions** — rating changes, price-target revisions, and initiations
  on the held names since the last close.
- **Pre-market & macro tape** — pre-market move on the largest positions; index futures
  (ES / NQ), 10Y yield, DXY, WTI, gold, VIX, BTC.

## Step 3 — Synthesize (output in chat)

Write a scannable briefing **directly in the chat**, in the user's language. Structure:

1. **Header** — account / holdings `as_of` / total market value / **day P&L ($ and %)** /
   total unrealized P&L. Put any data caveats here.
2. **Movers by dollar** — top contributors / detractors (then by % only if it adds
   something; a tiny position with a big % move is not a big mover).
3. **Today's catalysts** — your holdings reporting this week + today's macro, each with a
   source link.
4. **Overnight analyst actions** on your names — each with a source link.
5. **Pre-market & macro tape** — futures / rates / VIX / oil + pre-market on the big
   positions.
6. **Opportunities** — watchlist names in the buy-zone (largest upside vs fair value).

## Step 4 — Archive

After writing the brief, call `submit_morning_brief { date, markdown, summary }` to save
it to the user's dashboard archive (`/data/morning-brief`):

- `date` — today's US trading day, `YYYY-MM-DD`.
- `markdown` — the full brief you just wrote (the same Markdown).
- `summary` *(optional)* — a small object for the list view, e.g.
  `{ "dayPnlPct": -0.8, "totalValue": 118000, "topMover": "NVDA" }`.

Idempotent per day (re-submitting the same date overwrites). If the user said they don't
want it saved, skip this step.

## Rules

- **MCP numbers are the system of record.** Web search supplies context only — never
  restate a position size, price, weight, or P&L from search over the MCP value.
- **Cite every external claim** with a source URL. If a search returns nothing credible,
  say so — never fill the gap with a guess.
- The reference `valuation` (DCF) runs on default assumptions; don't feature it. Mention
  only if asked, flagged as such.
- **Private + per-user.** `get_holdings` / `get_watchlist` / `submit_morning_brief` are
  scoped to the authenticated user by the OAuth token — you never pass a user id.
