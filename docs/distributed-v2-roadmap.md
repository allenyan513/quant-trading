# 下一版分布式系统 — 任务拆解与优先级规划（v2 Roadmap）

> 日期：2026-05-31 · 关联：GitHub Issue #44 · 讨论存档：[`discussions/2026-05-31-distributed-architecture.md`](discussions/2026-05-31-distributed-architecture.md)
> 状态：规划草案，未开始实施。最高优先级任务的详细方案将在本文件确认后单独撰写。

本文件把讨论中浮现的所有任务拆成可执行单元，按优先级排序，并说明**排序依据**。
目标版本是 §9 的 **4 服务架构**（ingestion / analysis / portfolio[新] / evaluation）。

---

## 0. 排序的三条原则

1. **诚实性优先于功能性**：先堵住会"自我欺骗"的洞（前视污染、无样本外验证），再加功能。
   一个会骗自己的系统，加再多功能都是在虚假的地基上盖楼。
2. **小而确定性优先**：确定性、低风险、能立刻让现有产物变完整的任务（如 Portfolio sizing）先做。
3. **职责清晰是目标但分批兑现**：4 服务重构是方向，但不必一次性大爆炸；按状态归属逐块迁移，
   每步都能独立上线、可回滚。

---

## 1. 任务全集（来自讨论）

为便于引用，给每个任务编号（T1…）。后面的优先级表会引用这些编号。

### A 类 — 诚实性 / 可验证性（地基）
- **T1** valuation_snapshots 增加 `model_version` / `prompt_version` + 落完整 prompt/response（可审计）
- **T2** 确立"离线回测只在模型 cutoff 之后数据上做"的纪律，写进 `.claude/rules/analysis-agent.md`
- **T3** 分层验证：确定性估值引擎走单测/回测；LLM 重定价层只走前向验证（文档 + CI 约定）
- **T4** evaluation 增加"样本外正 alpha 的统计显著性"报表（样本量、命中率、vs 基准、置信区间）
- **T5** 模型升级流程：视为策略变更，强制重新 baseline，alpha 数据按 `model_version` 分桶

### B 类 — 4 服务重构（职责清晰）
- **T6** 新增 **portfolio 服务** 骨架（health 端点 + 容器 + outbox 接入），独占 `positions/book` 表
- **T7** Portfolio Construction：确定性 sizing 函数（固定分数/最多 N 仓/单板块上限/相关性约束）
- **T8** 持仓生命周期迁移：把 evaluation `/jobs/track` 的止损/止盈/到期**搬到 portfolio**
- **T9** analysis 改造为**无状态"观点引擎"**：输出 view/signal，不感知账本
- **T10** 持仓再决策接线：持仓状态喂 analysis；已持仓标的的 sell/hold 观点 → portfolio 决策平/减/不动
- **T11** evaluation 收敛为**纯学习层**：移除生命周期管理，只留 alpha 归因 + critique + feedback
- **T12** 服务状态归属铁律落地：每张表单一 owner 写、他人只读（代码 + review checklist）

### C 类 — 选股 / 发现（Universe Selection）
- **T13** `candidates` 表 + watchlist 加 `source/added_at/expires_at/discovery_reason`
- **T14** P1 scanner：异常成交量（ingestion `/scan/volume`，确定性，零 LLM）
- **T15** P1 scanner：分析师活动聚集（ingestion `/scan/analyst`）
- **T16** 候选人工提升流程（review 队列 → watchlist，带 TTL + 容量上限）
- **T17** P2：复合打分 + 自动提升
- **T18** P3：LLM 轻量分诊 `POST /triage`（analysis 侧）
- **T19** P4：evaluation 反馈回灌 scanner 打分权重

### D 类 — 上下文增强 / 闭环扩展
- **T20** 宏观/regime 上下文层：作为所有信号的自上而下输入条件
- **T21** 反馈闭环扩展：feedback 同时回灌 analysis(prompt) + portfolio(仓位校准) + ingestion(选股权重)

### E 类 — 基础设施成熟度（成长后再做）
- **T22** 事件 schema 显式版本化（契约稳定性）
- **T23** correlation id / 分布式 tracing 贯穿 event→notification→signal→outcome
- **T24** 死信队列（DLQ）替代手动 reprocessStuck
- **T25** outbox → 持久日志（Kafka/NATS）迁移（仅当扩展需要时）
- **T26** 接 live trading 前：独立的 pre-trade RiskEngine（信号与下单之间的强制闸门）

---

## 2. 优先级矩阵

| 优先级 | 任务 | 依据 |
|---|---|---|
| **P0（先做）** | T1, T2, T7 | 地基诚实性（T1/T2）+ 让现有信号立刻变完整的最小确定性功能（T7）。成本低、风险低、收益立竿见影。 |
| **P1** | T6, T9, T8, T11, T12 | 4 服务重构主体。先有 portfolio 骨架（T6），再迁移职责（T8/T11），同时把 analysis 无状态化（T9）、落地状态归属纪律（T12）。 |
| **P2** | T10, T4, T5 | 持仓再决策接线（T10，填黑洞）；验证体系增强（T4/T5，让"有没有 edge"可被诚实回答）。 |
| **P3** | T13, T14, T15, T16 | 选股层 P1（最小可用，零 LLM，人工提升）。属 nice-to-have，手动 watchlist 暂够用。 |
| **P4** | T3, T17, T18, T19, T20, T21 | 闭环增强、发现层进阶、宏观层。价值高但依赖前面骨架稳定。 |
| **P5（成长后）** | T22, T23, T24, T25, T26 | 基础设施成熟度 + live trading 前置。当前规模用不上，过早做是浪费。 |

---

## 3. 推荐执行序列（分批，每批可独立上线）

### 批次 1：地基（P0）— 最先做
> 目标：堵住自我欺骗的洞 + 让信号变完整。

1. **T7 Portfolio Construction（确定性 sizing）** ← **本轮选定的最高优先级任务，将单独写详细方案**
2. T1 model_version/prompt_version 入快照
3. T2 cutoff 后回测纪律（文档）

**为什么 T7 排第一**：它是**收益/成本比最高**的一个——一个确定性 sizing 函数 + 约束检查，
就把"一串孤立信号"变成"可度量的 book"，让 evaluation 的 alpha 归因第一次有业务意义。
且它纯确定性、低风险、不依赖任何重构，可以马上做。

### 批次 2：四服务重构主体（P1）
T6 portfolio 骨架 → T9 analysis 无状态化 → T8 生命周期迁入 portfolio → T11 evaluation 收敛纯学习 → T12 状态归属纪律。
> 注意：T7 的 sizing 逻辑在批次 1 可以先落在 evaluation 的 `/signals` 入场临时位置，
> 批次 2 再随 T6 迁入 portfolio 服务。这样批次 1 不被"必须先有新服务"阻塞。

### 批次 3：填黑洞 + 验证体系（P2）
T10 持仓再决策接线 → T4 显著性报表 → T5 模型升级 baseline 流程。

### 批次 4：选股层 P1（P3）
T13 表结构 → T14/T15 两个 scanner → T16 人工提升流程。

### 批次 5+：增强与成熟度（P4/P5）
按需推进，不强求节奏。

---

## 4. 关键依赖关系

```
T7 (sizing 函数) ──→ 可先独立落地 (批次1) ──→ 随 T6 迁入 portfolio (批次2)
T6 (portfolio 骨架) ──→ T8 (生命周期迁入) ──→ T11 (evaluation 收敛)
                   └──→ T9 (analysis 无状态) ──→ T10 (持仓再决策)
T13 (candidates 表) ──→ T14/T15 (scanners) ──→ T16 (提升) ──→ T17/T18/T19 (进阶)
T4 (显著性报表) ──→ 依赖足够的前向样本积累（时间，不是代码）
```

---

## 5. 下一步

按用户指示：本文件 + 讨论存档完成后，开始为 **T7（Portfolio Construction 确定性 sizing）** 撰写详细实施方案
（schema、函数签名、约束规则、放置位置、与现有 `/signals` 流程的衔接、测试计划）。
