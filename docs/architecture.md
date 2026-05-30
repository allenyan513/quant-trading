# Quant Trading System — Architecture (v1)

> 状态：v1 设计已锁定。本文件是后续开发与 review 的唯一架构基准。

## 1. Context（为什么这么做）

重启一个**事件驱动的量化交易系统**。核心是一条闭环流水线：

```
外部数据源 → ingestion → (event) → analysis → (trading signal) → evaluation → (feedback) ↺ analysis
```

参考了 `legends/` 下两个成熟项目的经验：

- **`legends/quant-researcher`**（Python，CLI+Agent）—— 最贴近目标。复用其：事件→信号流水线、两阶段事务、PIT（point-in-time）正确性、限流 FMP 客户端、staleness-aware 刷新、TradingSignal 数据形状、System A/B 分层、decision tracking。
- **`legends/value-scope`**（Next.js+Supabase，TS）—— 成熟的估值引擎。复用其：10+ 估值模型（纯函数 → ValuationResult）、公司原型分类（archetype）、WACC（CAPM bottom-up）、consensus fair value、估值快照 + 实时计算双路径。

## 2. 锁定的技术决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 语言 | **TypeScript / Node.js** | Anthropic Agent SDK 只有官方 TS/Python 版；Go 无官方 Agent SDK |
| 形态 | **3 个独立 HTTP 服务**（ingestion / analysis / evaluation）组成分布式系统 | 用户要求；可独立部署、独立伸缩 |
| 通信 | **服务间直接 HTTP 调用** + DB outbox 兜底（at-least-once） | 简单；不引入消息队列 |
| 数据库 | **Neon（serverless Postgres）+ Drizzle ORM** | 类型安全、TS-first、serverless 友好 |
| Agent | analysis 用 **`@anthropic-ai/claude-agent-sdk`** 的 `query()` + 自定义 `tool()` | 唯一真正的 LLM agent |
| 金融数据 | **混合**：ingestion 用自建限流 FMP 客户端做原始落库(PIT)；analysis agent 用已连的 **FMP MCP** 工具按需查询 | 各取所长 |
| 自优化 | evaluation 做 **检索增强的上下文反馈**（不自动改参数/代码） | v1 现实、可控、可解释 |
| 部署 | **Cloud Run** / 本地 **Docker Compose** | 每服务一个容器镜像 |
| HTTP 框架 | **Hono** | 轻量、TS-first、serverless 友好 |
| 仓库 | **pnpm workspaces 单仓库**（packages/shared + services/*） | 既独立又共享领域类型 |

v1 范围：**只做 pull 闭环**（定时拉取 earnings / ratings）。实时 push（流式合并/去重）留到 v2。mock / live trading 服务不做。

## 3. 服务边界与职责

关键观点：**"agent" 这个词被用得太宽**。三个服务里只有 analysis 是真正的 LLM agent；ingestion 是确定性的数据管道；evaluation 是"确定性结算 + LLM 复盘"的混合体。这样划分是为了控制成本/延迟/可重放性。

### 3.1 ingestion service（确定性管道，无 LLM）
- 外部信息的**唯一接收者**。
- v1 只做 **pull**：被 Cloud Scheduler / cron 触发 HTTP 端点 → 用限流 FMP 客户端拉数据 → **原始落库**（PIT：`known_at = FMP acceptedDate`）→ 写 `events` 表（outbox）→ HTTP 投递给 analysis。
- **本身不分析**。LLM 在 ingestion 里只会作为 v2 push 通道的**分类工具**出现（合并同类/去重），v1 不涉及。
- `/pull/*` 默认从 `watchlist` 表取 symbol（body 不传 `symbols` 时）；watchlist 由 `pnpm seed:watchlist` 手动 seed。
- **每个 puller 的过滤原则**：拉取 → 过滤掉无用消息 → **保留窗口内全部合格事件**（不再塌缩成每 symbol 1 条）。所有原始事件落 `events` 表（`(source, external_id)` 去重）。
- **聚合投递**：投递时按 `(symbol, event_type)` 把**尚未投递过的**事件聚合成**一条 `notification`**（如「NVDA: 3 grade changes」）发给 analysis，让其把整组事件整体重定价成 **1 个信号**，而不是被 N 个近乎同时的事件各产一个互相打架的信号。事件级 `delivery_status` 充当「是否已通知过」——通知投递成功后才把成员事件回标 `delivered`；`batch_key = hash(成员 external_id 集合)` 保证崩溃重试不重复建通知。
- 端点（v1）：
  - `POST /pull/earnings` —— 财报（EPS 实际 vs 预期）
  - `POST /pull/ratings` —— 分析师升降级（`grades`，过滤 no-op maintain）
  - `POST /pull/price-targets` —— 分析师目标价变动（`price-target-news`）
  - `POST /pull/news` —— 公司新闻
  - `POST /pull/insider` —— 内部人 Form4 买卖（只留 P-Purchase/S-Sale）
  - `POST /pull/mna` —— 并购（市场级 `mergers-acquisitions-latest`，按 watchlist 过滤）
  - `POST /internal/redeliver` —— 重投 `pending` 的 notifications（兜底）
  - `GET /healthz`

### 3.2 analysis service（核心，LLM agent）
- 接收 `POST /notifications`（一条聚合通知 = 某 symbol 同类型的一批事件），整批重定价。
- **两阶段 + 异步 ACK**（复用 quant-researcher 模式）：
  1. intake（快，ACK 前）：按 `(source, batch_key)` 定位 notification + 去重（已有信号→duplicate）；拆开 bundle classify，noise 在调 LLM 前短路；标 `processing`。
  2. 慢阶段（后台，不持有事务跨网络）：计算/读取 reference valuation + trading valuation，把整组事件跑一次 agent loop 生成 **1 个信号**；agent 可按需回查 `events` 表或 FMP 补数据。
  3. 持久化 `trading_signals`（挂 `notification_id`），标记 notification `done`。
- 崩溃恢复：后台慢阶段若死，notification 卡在 `processing`，由 `reprocessStuck`（`POST /internal/reprocess`，cron）按年龄阈值捞回重跑。
- 产出 **trading signal** → HTTP 投递给 evaluation（同样 outbox 兜底）。
- 端点：`POST /notifications`、`POST /internal/redeliver`、`POST /internal/reprocess`、`GET /healthz`。

### 3.3 evaluation service（结算 + 复盘，混合）
- `POST /signals`：登记新信号，纳入跟踪。
- 定时任务（Cloud Scheduler 触发 `POST /jobs/track`）：确定性结算信号生命周期 + 计算 alpha。
- `POST /jobs/critique`：LLM 对信号质量/thesis 复盘，写入 feedback 库。
- 端点：`POST /signals`、`POST /jobs/track`、`POST /jobs/critique`、`GET /healthz`。

## 4. 事件传输（at-least-once，无队列）

直接 HTTP 调用的风险是"下游挂了就丢消息"。用 **DB outbox 兜底**解决：

1. 生产者写业务数据 + 写 outbox 行（status=`pending`）：ingestion 写 `events` + `notifications`，analysis 写 `signal_deliveries`。
2. 事务提交后立即 HTTP POST 给下游。
   - 成功（2xx）→ 标记 `delivered`。
   - 失败 → 留 `pending`，由 `POST /internal/redeliver`（cron 周期触发）重投。
3. 消费者**幂等**：ingestion→analysis 按 `(source, batch_key)` 去重（notification 唯一约束 + `uq_signals_notification` 保证一通知一信号）；analysis→evaluation 按 `signal_id` 去重。重复投递不会产生重复信号。

这样在不引入 Pub/Sub 的前提下拿到 at-least-once + 幂等。未来要分布式扩展时，把"POST + outbox"替换成 Pub/Sub 即可，消费端契约不变。

## 5. 参考估值 vs 交易估值（System A / System B）

- **Reference valuation（参考估值 / System A）**：慢、基本面驱动的内在价值。DCF-FCFF（主）+ multiples + PEG + scenario，聚合成 consensus fair value。**只在财报/估值刷新时更新**。持久化为 `valuation_snapshots`（不可变，带 `code_version` 便于重放）。复用 value-scope 的模型与 archetype 分类。
- **Trading valuation（交易估值 / System B）**：快、事件调整后的近端价值。以参考估值为**输入之一**，叠加最近事件（评级/目标价/新闻/动量）重定价。
- **Trading signal**：由 `当前价 vs 交易估值 + conviction + 风险位` 推导。形状（复用 quant-researcher）：

```ts
TradingSignal {
  id, notification_id, symbol,        // 一通知一信号；event_id 为 legacy（聚合前的 1:1 链接，现为 null）
  direction: 'buy'|'sell'|'hold',
  target_price, stop_loss, horizon_days,
  conviction: 'low'|'medium'|'high',   // 仅通知优先级，不是仓位
  entry_price, fair_value_base, deviation_pct,
  thesis, generated_by: 'llm'|'algo',
  snapshot_id,                          // 关联的 reference valuation 快照，便于重放
  status: 'open'|'target_hit'|'stopped_out'|'expired'|'closed',
  created_at, expires_at
}
```

关键原则：**参考估值不是答案，事件重定价才是**（System A 季度数据滞后，没有反映今天的事件）。

## 6. analysis agent 内部（Agent SDK）

- 用 `query()` 跑一个受控 agent loop。系统提示强调"从事件重定价，参考估值只是输入之一"。
- **工具集**：
  - 自建 `tool()`：`get_reference_valuation(symbol)`、`compute_trading_valuation(...)`、`get_price_history / technicals(symbol)`、`read_recent_feedback(symbol|event_type)`（检索 evaluation 的经验库）、`emit_signal(...)`（强制结构化输出）。
  - 外部 MCP：已连的 FMP MCP（news / analyst / statements / quote / technicalIndicators / secFilings …），通过 `mcpServers` 选项按需查询。
- **确定性护栏**：`emit_signal` 用 JSON schema 强约束；direction/conviction 用 enum；价格/horizon 校验；agent 最大轮数与 token 上限；noise 事件根本不进 agent。
- 每个事件类型有不同 playbook（earnings → 先刷新参考估值再重定价；rating/price_target → 直接调交易估值；news → 先判材料性）。

## 7. evaluation + 自优化闭环（重点）

分三层，**对可行性诚实**：

### (a) 确定性结算（outcome tracking）
- 信号生命周期：`open → target_hit / stopped_out / expired / closed`（用 forward 价格判定）。
- 各 horizon（1d/1w/1m）前向收益；vs 基准（SPY/sector）的 alpha。
- **conviction 校准**：high conviction 是否真的跑赢？聚合命中率、平均收益。
- 表：`signal_outcomes`（按 signal_id × horizon）。

### (b) LLM 复盘（critique）
- 对已结算信号，LLM 评估 thesis 质量、是否过度依赖某类事件、误判模式。
- 输出结构化评分 + 一段教训文本，写入 feedback 库。

### (c) 反馈机制（feed back into analysis）
- feedback 不自动改代码/参数，而是**沉淀为可检索的"经验/教训"库**（`feedback_notes`）。
- analysis agent 在生成新信号前，通过 `read_recent_feedback` 工具检索相关经验（按 symbol / event_type / 近期表现），作为上下文注入。
- 这就是 v1 的"自优化"：**retrieval-augmented in-context learning**，安全、可解释、可回滚。

**后续阶段路径**（不在 v1）：参数自动调优 → prompt 演化 → 策略 A/B。

## 8. Neon Postgres schema（Drizzle，DDL 草图）

复用 legacy 表结构。核心表：

- `universe`（symbol PK）—— 全部已知标的目录 + 元数据（name/sector/industry/beta/archetype）
- `watchlist`（symbol PK）—— 主动观察的活跃子集，驱动 `/pull/*`
- `daily_prices`（symbol, trade_date）—— OHLCV + adj_close
- `income_statement` / `balance_sheet` / `cash_flow`（symbol, period, fiscal_date；**known_at = acceptedDate** 用于 PIT）
- `financial_ratios` / `analyst_estimates`
- `valuation_snapshots`（snapshot_id PK）—— reference valuation，JSON 存 assumptions/result，带 code_version
- `events`（id PK，唯一 `(source, external_id)`）—— 原始事件 + 生产者 outbox（`delivery_status`：是否已被某条通知投递过）
- `notifications`（id PK，唯一 `(source, batch_key)`）—— 聚合通知 + 双状态 outbox：消费者 `status pending|processing|done|noise`、生产者 `delivery_status`；`event_ids` JSONB 关联其打包的 events
- `trading_signals`（见 §5）—— 加 `notification_id`（唯一约束 `uq_signals_notification`，一通知一信号）；`event_id` 退为 legacy
- `signal_deliveries` —— analysis→evaluation 的 outbox
- `signal_outcomes`（signal_id, horizon）—— 结算结果 + alpha
- `feedback_notes`（id PK）—— 经验/教训库，带 symbol/event_type 标签、embedding 可选

所有金额存原始数字（展示层格式化）；嵌套数据用 JSONB；版本化用复合主键。

## 9. 仓库结构

```
quant-trading/
  pnpm-workspace.yaml
  package.json                 # 根脚本
  tsconfig.base.json
  docker-compose.yml
  .env.example
  docs/architecture.md
  packages/
    shared/                    # 领域类型 / envelope / config / db(schema+client) / fmp / http
  services/
    ingestion/   ( + Dockerfile )
    analysis/    ( + Dockerfile )
    evaluation/  ( + Dockerfile )
```

每个 service 独立 `package.json`、独立构建、独立镜像、独立部署到 Cloud Run。`shared` 作为 workspace 依赖被三者引用。

## 10. 分阶段交付

最小端到端纵向切片优先（先打通闭环，再加宽）：

1. **M0 骨架**：monorepo + shared(types/envelope/config) + 三服务 health 端点 + docker-compose 起得来。
2. **M1 数据**：FMP 客户端 + Drizzle schema + migration；`POST /pull/earnings` 落库 + 写 events + 投递。
3. **M2 信号**：analysis `/events` → reference valuation（先 DCF 一个模型）→ trading valuation → agent emit_signal → 持久化 + 投递。
4. **M3 闭环**：evaluation `/signals` 登记 + `/jobs/track` 结算 + `/jobs/critique` 写 feedback；analysis `read_recent_feedback` 接回。
5. **M4 加宽**：更多事件类型、更多估值模型、conviction 校准报表。
6. **v2**：实时 push 通道（流式合并/去重）、Pub/Sub 替换 HTTP outbox、mock/live trading。

## 11. 部署要点（Cloud Run）

- 每服务一个容器；Cloud Run scale-to-zero。
- cron 触发：Cloud Scheduler → ingestion `/pull/*`、evaluation `/jobs/*`、各服务 `/internal/redeliver`。
- 服务间用各自的 Cloud Run URL + service-to-service 认证调用。
- DB：Neon serverless（连接走 pooled endpoint）。
- secrets：ANTHROPIC_API_KEY / FMP_API_KEY / DATABASE_URL 走 Secret Manager / env。
