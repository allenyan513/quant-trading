---
paths:
  - "services/analysis/**/*.ts"
---

# analysis service —— LLM agent 细则

analysis 是系统里**唯一**真正的 LLM agent。完整设计见 [docs/architecture.md](../../docs/architecture.md) §5 / §6，这里是写代码时的硬约束。

## 两阶段事务（不可破坏）

`POST /events` 处理 event 时严格分三步（见 `src/pipeline.ts`）：

1. **Tx1（快）**：按 `(source, external_id)` 去重 + 标记 event `processing`；**noise 事件在调 LLM 之前短路**，绝不进 agent。
2. **慢阶段（不持有事务）**：算/读 reference valuation + trading valuation，跑 agent loop。耗时操作不要包在事务里。
3. **Tx2（快）**：持久化 `trading_signals`，标记 event `done`，写 evaluation 的 outbox 行。

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
