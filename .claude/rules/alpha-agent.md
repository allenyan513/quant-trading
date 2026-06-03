---
paths:
  - "services/alpha/**/*.ts"
---

# alpha service —— LLM agent 细则

alpha 是系统里**唯一**真正的 LLM agent。这里是写代码时的硬约束（设计讨论/路线图见 GitHub issues，如 #44/#48）。

## 异步 ACK + 两阶段（不可破坏）

消费单位是**通知（notification）**，不是单个 event：一条 notification = 某 symbol 同类型的一批事件聚合（由 data 按 `(symbol, event_type)` 打包），**整批重定价成 1 个信号**。

`POST /notifications` 是**异步 ACK**：先 `await intakeNotification`（快），立即回 202，再后台跑 `processNotification`（慢）。这样生产者（data）的投递不会被 LLM 阻塞超时。见 `src/pipeline.ts`。

1. **intake（快，ACK 前 await）**：`findOrInsertNotification` 按 `(source, batch_key)` 定位/建通知；已有信号→`duplicate`；**noise（`classifyNotification` 判不材料）在调 LLM 前短路**标 `noise`（绝不进 agent）；否则标 `processing` 返回 `accepted`。纯 DB 操作，秒回。
2. **process（慢，后台）**：`computeReferenceValuation`（staleness-aware，复用近期快照）→ `generateSignal`（agent）→ 持久化 `alpha_trading_signals`（带 `snapshot_id`）→ 标 `done` → 投递 portfolio（`config.portfolioUrl()`）。不持有事务跨网络。
3. **恢复**：后台 process 若崩溃（实例被杀），notification 卡在 `processing`，由 `reprocessStuck`（`POST /internal/reprocess`，cron 触发）按年龄阈值捞回重跑——这是异步 ACK 下补回 at-least-once 的安全网，**不要删**。

> 状态机挂在 `data_notifications`（`pending|processing|done|noise`），**不在 `data_events` 上**——event 只有 producer 侧 `delivery_status`（是否已被某条通知投递过），没有消费侧 status。
>
> Cloud Run 注意：响应返回后 CPU 可能被限流，后台 process 不保证跑完——`/internal/reprocess` 正是兜底。v2 应换成 Pub/Sub / Cloud Tasks 真正解耦。

## 估值分层

- **Reference valuation（System A）**：慢、基本面驱动，只在财报/估值刷新时更新，持久化为不可变 `alpha_valuation_snapshots`（带 `code_version`）。
- **Trading valuation（System B）**：快、事件调整后的近端价值，以 reference 为输入之一。
- 核心原则：**参考估值不是答案，事件重定价才是**。不同 event 类型有不同 playbook（earnings 先刷参考估值；rating/price_target 直接调交易估值；news 先判材料性）。
- **估值引擎**（`services/alpha/src/valuation/`，移植自 `legends/value-scope` 的纯函数多模型引擎）：FCFF DCF(growth/EBITDA-exit, 5Y/10Y) + multiples + PEG + EPV + DDM，按公司 **archetype** 选模型与终值增长率，WACC 用 CAPM。`computeFullValuation` 聚合成 **consensus fair value（主 = FCFF Growth Exit 5Y）**；缺输入的模型自动降级，无财报/无价则落 price-only 快照；快照 `detail` 存完整结果可重放。FCFF + GDP-fade 终值偏**保守**（System A 的诚实下限，真正决策靠事件重定价）。移植的模型文件标 `// @ts-nocheck`（vendored，靠本仓单测兜底）。

## Agent loop（plain Messages API，非 Agent SDK）

- 用 **plain `@anthropic-ai/sdk` 的 Messages API** 跑**手写的 tool-use loop**，**不是** Agent SDK 的 `query()`。原因见 `src/agent.ts` 顶部注释：`query()` 会把 `claude` CLI 当子进程拉起（镜像里多一个二进制 + CLI 式鉴权），不适合无状态 Cloud Run 微服务；Messages API 用 `ANTHROPIC_API_KEY` 直连、延迟更低、对 tool loop 有确定性控制。多轮 tool 调用 + 强制收尾的 agentic 行为不变。
- 模型取 `config.signalModel()`；`MAX_TURNS = 6`，`max_tokens` 有上限。
- 工具是 `Anthropic.Tool[]` 声明 + `runTool(name, input)` 分发（**全只读**）：`get_fundamentals(symbol)`、`get_technicals(symbol)`、`emit_signal(...)`（最后一轮 `tool_choice` 强制调用）。新增工具沿用这个声明 + switch 模式。
- **参考估值不是 agent 工具**：在进 agent 前由 `computeReferenceValuation` 算好，作为 FACTS 注入 prompt（agent 的活是「从事件重定价」，参考估值只是输入之一）。
- 辅助数据（fundamentals / technicals）经 `marketdata` **读穿缓存**（`marketdata.getRatios` / `getDailyPrices`）→ PIT 落库复用；**不在 agent 里直连 FMP，也不挂 FMP MCP**。

## 确定性护栏（必须保留）

- `emit_signal` 用 `input_schema` 强约束结构化输出；`direction` / `conviction` 用 enum；产物再过 `sanitizeSignalDraft`（`src/signal-draft.ts`）校验价格与 horizon。
- 已设上限防失控：`MAX_TURNS = 6` + `max_tokens`；最后一轮 `tool_choice` 强制 `emit_signal` 收尾。
- `conviction` 只决定通知优先级，**不是仓位**。
- 信号必须带 `snapshot_id` 关联当时的 reference valuation 快照，保证可重放。
- 改 agent 行为/工具/提示前，先确认不会绕过上述护栏或两阶段事务。

## 验证纪律 / 前视污染（T1/T2，硬约束）

LLM 给真实事件定价，事件结果可能已在模型训练数据里 → **cutoff 之前数据上的回测是自我欺骗**。

- **可审计**：每个信号落 `alpha_trading_signals.model_version`（= `resp.model`，实际服务模型）+ `prompt_version`（agent 里 `PROMPT_VERSION` 常量，改 `SYSTEM_PROMPT`/工具/loop 契约时 bump）；完整 system/user prompt + 多轮 messages + token 落 `alpha_signal_audits`（按需读，**别塞进 `alpha_trading_signals` 热表**）。复盘"模型为何这么判"从 `alpha_signal_audits` 取，不靠重跑。
- **样本外判定**：`alpha_trading_signals.out_of_sample` = 该信号**所有**所定价事件的 `observed_at` 都晚于 `config.modelCutoff()`（纯函数 `isOutOfSample`，`@qt/shared`）；有缺失/无事件 → `null`（未判定，保守不算干净）。
- **回测/alpha 只统计 `out_of_sample = true` 的信号**。严禁在 cutoff 之前的数据上跑回测并当真实表现汇报。
- **换模型 = 策略变更**：`MODEL_CUTOFF` 随 `SIGNAL_MODEL` 一起改；样本不可跨 `model_version` 混算（为 T5 分桶 baseline 埋点）。
