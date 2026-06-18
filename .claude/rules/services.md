---
paths:
  - "services/**/*.ts"
---

# 服务（Hono）约定

三个服务结构同构：`src/index.ts` 建 `Hono` app、挂端点、`serve({ fetch: app.fetch, port: config.port })`。改一个服务时参考另外两个的现有写法保持一致。

## 端点

- 每个服务都有 `GET /health` → `c.json(ok({ service, status: "up" }))`。
- 响应一律走 envelope：成功 `c.json(ok(data))`；失败 `c.json(fail(code, message), httpStatus)`。**不要**返回裸对象。
- 解析 body：`await c.req.json()`，用 `.catch(() => ({}))` 或 try/catch 兜住非法 JSON，返回 `fail("bad_request", ...)` 400。
- 端点内 `try/catch` 包住业务逻辑，异常转成 `fail(...)` + 5xx，错误码用 snake_case（如 `pull_earnings_failed`）。

## 配置与端口

- 只通过 `config.xxx()` 读 env；缺必填项让它在调用处抛（fail-fast）。不要在模块顶层读 `process.env`。
- 端口来自 `config.port`（默认 8080）；本地 dev 由 package.json 的 `PORT=808x` 指定，docker 由 compose 注入。不要在代码里硬编码端口。

## 服务间投递（outbox / at-least-once）

- 调下游用 `deliverJson(url, body, { timeoutMs, idempotencyKey })`（`@qt/shared`），URL 取自 `config.alphaUrl()` / `config.portfolioUrl()`。
- 模式：**同一事务**里写业务数据 + outbox 行（`status: "pending"`）→ 提交 → 投递；成功标 `delivered`，失败留 `pending` 等 `POST /internal/redeliver`（cron 触发）重投。
- 消费端必须**幂等**：按 `(source, external_id)`（或对应唯一键）去重，重复投递不得产生重复结果。
- 新增需要被可靠传递的跨服务消息时，沿用这个 outbox 模式，不要直接 fire-and-forget。

## 日志

- 每个服务有 `src/log.ts` 导出 `log = createLogger("<service>")`（`@qt/shared` 的结构化 logger）。**不要直接 `console.log`**。
- `event` 名用点分 `<area>.<step>[.<outcome>]`（如 `pipeline.signal`、`deliver.event.ok`），字段放第二个参数：`log.info("event.received", { external_id, symbol, type })`。
- **带上可追踪键**：事件链路用 `external_id`，信号链路用 `signal`（= signal id），这样能 grep 一条记录跨三个服务端到端追踪。
- 级别：主流程 `info`；soft-fail / outbox 留 `pending` 用 `warn`；抛错用 `error`；逐 tool/payload 等啰嗦细节用 `debug`（`LOG_LEVEL=debug` 才显示）。`LOG_FORMAT=json` 输出机器可解析行。

## 边界

- **摄入是 news 驱动**(issue #59):`/news/pull` 拉市场新闻入 `data_news_items` staging,并**后台异步**对本次新增行触发 triage（fire-and-forget,pull 立即返回；失败行留给 `/news/triage` cron sweep 重试——同 alpha 的 intake→后台 process 拆分）→ 人工在仪表板选 → `/news/notify` 投 alpha。旧的 6 个 `/pull/*` per-source 触发器已删（同一真实事件被多源重复触发）。
- **triage 每条的顺序**(`triage.ts`):profile 初筛(`runScreen`,只需 profile/市值)→ 不过 → 写 `triage_priority='low'`,**不进 LLM**;过 → `warmSymbol()` 确定性读穿预热该 symbol 全套 marketdata 缓存(三财报/ratios/estimates/prices/grade/insider/pt)→ Haiku agent 定级。即「淘汰=最低优先级」,不是单独状态。
- data 含**一处轻量 LLM**——news 分诊 agent(`src/agent.ts`，跑最便宜的 `config.triageModel()`/Haiku)。**两层**:先过确定性**规则管道**硬筛(`src/screening/`,市值≥$1B 等客观门槛,`runScreen` 短路+记 `screen_failed_rule`),过筛者再交 agent 判**材料性/优先级**(不判方向——那是 alpha 的活)并调 fetch tool **预热**该 symbol 的 marketdata 缓存(ratings/insider/price_targets/statements/prices)。其余仍是确定性拉取/落库/投递。
- 也含**选股发现 scanner**(`/scan/*`):市场级确定性扫描 → 产 `data_candidates`(**绝不直送 alpha**;只读发现队列)。**注意**:旧的「promote 候选进 `data_watchlist` + `source='discovery'`/TTL + `expire-watchlist` 清理」已**切断**——`data_watchlist` 改为 **per-user 私有自选**(列 `user_id/symbol/note/added_at`,无 source/TTL),`/candidates/promote`、`/jobs/refresh-watchlist`、`/internal/valuation-sweep`、`/internal/expire-watchlist` 均 no-op(返回 `severed`),见重连 issue #120。
- 真正 agentic 的**定价/决策** agent 只在 alpha（多轮 tool-use 重定价,见 `.claude/rules/alpha-agent.md`）。data 的分诊 agent 只做轻量筛选/路由+缓存预热,不出交易决策。两者都用 plain Messages API + 手写 tool loop（**不用** Agent SDK `query()`）。
- portfolio 无 LLM：信号入场时对 `portfolio_positions` 做开仓 / 再决策平仓 / 结算平仓，独占该表。

## 状态归属（单一 owner 写，T12 铁律）

每张表的**创建写**只有一个 owner，其它服务只读（表名按 owner 加前缀，见 `database.md`「表命名」）：

- `data_events` / `data_notifications` / `data_candidates` / `data_watchlist` / `data_news_items`（及其余 `data_*` 拉取表）← **data**。
- marketdata 读穿缓存（`data_daily_prices` / `data_income_statement` / `data_balance_sheet` / `data_cash_flow` / `data_financial_ratios` / `data_analyst_estimates` / `data_ratings` / `data_insider` / `data_price_targets` / `data_marketdata_fetches`）经 `@qt/shared/marketdata` 写入 ← 逻辑上归 **data**（data 的分诊 agent 主动预热；alpha 命中热缓存,miss 时同一读穿层回填——这是允许的共享 read-through,非乱写）。
- `data_valuation_snapshots` ← **data**（确定性 reference valuation 引擎住在 data，`src/valuation/`；写不可变快照。alpha 经 `POST /internal/valuation` 取回作为重定价输入，不写该表）。
- `alpha_trading_signals` / `alpha_signal_audits` / `alpha_signal_deliveries` ← **alpha**（alpha 投递前必已写入 `alpha_trading_signals`；信号带 `snapshot_id` 指向 `data_valuation_snapshots`；portfolio **绝不 insert** 它）。
- `portfolio_positions` ← **portfolio**。portfolio 拥有持仓生命周期，并把它**镜像**到 `alpha_trading_signals.status`（开→平/止损/止盈/到期）——这是唯一允许的"非 owner 写"，且只写 `status` 一列。
- 例外（既有设计，非违规）：`data_events` / `data_notifications` 的**双状态**——生产者侧 `delivery_status`（data）与消费者侧 `status`（alpha 推进 `pending|processing|done|noise`）各管一列。
- 新增跨服务可达的表/列时，先确定单一创建 owner；消费侧只读或只改约定好的状态列。
