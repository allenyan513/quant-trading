---
paths:
  - "services/analysis/**/*.ts"
---

# analysis service —— LLM agent 细则

analysis 是系统里**唯一**真正的 LLM agent。完整设计见 [docs/architecture.md](../../docs/architecture.md) §5 / §6，这里是写代码时的硬约束。

## 异步 ACK + 两阶段（不可破坏）

`POST /events` 是**异步 ACK**：先 `await intakeEvent`（快），立即回 202，再后台跑 `processEvent`（慢）。这样生产者（ingestion）的投递不会被 LLM 阻塞超时。见 `src/pipeline.ts`。

1. **intake（快，ACK 前 await）**：`findOrInsertEvent` 按 `(source, external_id)` 去重；已有信号→`duplicate`；**noise 在调 LLM 前短路**（绝不进 agent）；否则标 `processing` 返回 `accepted`。纯 DB 操作，秒回。
2. **process（慢，后台）**：reference valuation + agent loop + 持久化 `trading_signals` + 标 `done` + 投递 evaluation。不持有事务跨网络。
3. **恢复**：后台 process 若崩溃（实例被杀），event 卡在 `processing`，由 `reprocessStuck`（`POST /internal/reprocess`，cron 触发）按年龄阈值捞回重跑——这是异步 ACK 下补回 at-least-once 的安全网，**不要删**。

> Cloud Run 注意：响应返回后 CPU 可能被限流，后台 process 不保证跑完——`/internal/reprocess` 正是兜底。v2 应换成 Pub/Sub / Cloud Tasks 真正解耦。

## 估值分层

- **Reference valuation（System A）**：慢、基本面驱动，只在财报/估值刷新时更新，持久化为不可变 `valuation_snapshots`（带 `code_version`）。
- **Trading valuation（System B）**：快、事件调整后的近端价值，以 reference 为输入之一。
- 核心原则：**参考估值不是答案，事件重定价才是**。不同 event 类型有不同 playbook（earnings 先刷参考估值；rating/price_target 直接调交易估值；news 先判材料性）。

## Agent loop（Agent SDK）

- 用 `@anthropic-ai/...` 的 `query()` 跑受控 loop，模型取 `config.signalModel()`。
- 自建工具用 `tool()`：`get_reference_valuation` / `compute_trading_valuation` / `get_price_history|technicals` / `read_recent_feedback`（检索 evaluation 的经验库）/ `emit_signal`。
- 外部 FMP MCP 通过 `mcpServers` 选项按需查询（news / analyst / statements / quote / technicalIndicators …）。

## 确定性护栏（必须保留）

- `emit_signal` 用 JSON schema 强约束结构化输出；`direction` / `conviction` 用 enum；校验价格与 horizon。
- 设 agent 最大轮数与 token 上限，防止失控。
- `conviction` 只决定通知优先级，**不是仓位**。
- 信号必须带 `snapshot_id` 关联当时的 reference valuation 快照，保证可重放。
- 改 agent 行为/工具/提示前，先确认不会绕过上述护栏或两阶段事务。
