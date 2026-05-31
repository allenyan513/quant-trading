# 架构讨论存档 — 分布式系统设计 / LLM 策略 / 下一版四服务

> 存档日期：2026-05-31
> 关联：GitHub Issue #44
> 性质：一次完整设计讨论的逐主题存档（保留"为什么"的原始论证，不只是结论）。
> 状态：讨论结论已沉淀；落地优先级见 [`distributed-v2-roadmap.md`](../distributed-v2-roadmap.md)。

本文件是讨论的**完整记录**，按主题组织。讨论从"三服务对标业界"出发，经过 NautilusTrader 调研、
LLM 作为策略的根本问题、可行性的诚实评估、业务缺口分析，最终收敛到**下一版四服务分布式设计**。

---

## 目录

1. [三服务分布式设计 vs 业界成熟系统](#1-三服务分布式设计-vs-业界成熟系统)
2. [NautilusTrader 深入介绍](#2-nautilustrader-深入介绍)
3. [LLM 作为交易策略的根本问题：前视污染](#3-llm-作为交易策略的根本问题前视污染)
4. [学界/业界定位与可行性的诚实评估](#4-学界业界定位与可行性的诚实评估)
5. [为什么用 LLM 而非硬编码 Python 策略（认知校准）](#5-为什么用-llm-而非硬编码-python-策略认知校准)
6. [业务层缺口：完整投资链路 vs 现有三服务](#6-业务层缺口完整投资链路-vs-现有三服务)
7. [发现/选股层（Universe Selection）具体设计](#7-发现选股层universe-selection具体设计)
8. [五件套标准命名 + 最省力落地](#8-五件套标准命名--最省力落地)
9. [最终结论：下一版分布式系统设计（4 服务）](#9-最终结论下一版分布式系统设计4-服务)
10. [参考文献](#10-参考文献)

---

## 1. 三服务分布式设计 vs 业界成熟系统

### 1.1 先定位：我们属于哪一类

业界"量化系统"架构的**第一决定因素是延迟预算**，不是业务复杂度。我们的 analysis 里有 LLM agent loop →
单次决策是**秒~分钟级** → 因此我们属于：

> **低频、研究/信号型（research & signal-generation）流水线**，而不是延迟敏感的执行型（execution）系统。

这个定位决定了"业界做法"里哪一半与我们相关、哪一半完全不必学。

### 1.2 业界完整交易栈的标准分解

```
Market Data/Feed Handler → Alpha/Signal → Pre-trade Risk → OMS/EMS → Smart Order Router → 交易所
                                                              ↓
                            Position/PnL ← Post-trade(TCA/对账/复盘/回测/研究) ←┘
```

我们三服务的映射：

| 我们的服务 | 业界对应域 | 备注 |
|---|---|---|
| ingestion | Feed Handler / Market Data | 只做事件类；行情辅助数据走 read-through cache |
| analysis | Alpha / Signal Generation | 核心，LLM 是差异化 |
| evaluation | Post-trade：TCA + 研究反馈 | outcome tracking ≈ TCA，feedback ≈ 研究回流 |

**我们刻意没有的三块**：Pre-trade Risk Gate、OMS/EMS、Position/PnL。v1 不做 live trading 所以合理，
但铁律：**一旦接真实执行，信号和下单之间必须有一道独立的、同步阻塞式的风控闸门**——风控永远是单独组件，
不能塞进 alpha 逻辑。这是未来唯一的结构性缺口。

### 1.3 关键认知：热路径 vs 冷路径

成熟系统**不按流水线阶段切服务，按延迟域切**：

- **热路径**（行情→策略→风控→OMS）：极度耦合、低延迟。HFT 用 FPGA / kernel-bypass / colocation；
  稍慢的用 LMAX Disruptor（进程内环形缓冲）/ Aeron / 多播，常常单进程或共享内存，绝不在中间插 HTTP 和数据库。
- **冷路径**（TCA、对账、回测、研究、报表）：异步、可重放、容忍秒级延迟，用 Kafka / NATS 串联，HTTP 也可以。

**我们三个服务全部在冷路径上。** 所以选 "HTTP + DB outbox" 而非消息队列/共享内存，从业界标准看
**不是妥协，是对延迟域的正确选择**。有人拿 Kafka/Disruptor 来"指正"，那是把热路径要求错套到冷路径。

### 1.4 我们已经踩中的成熟模式（都有正式名字）

1. **Transactional Outbox + Idempotent Consumer** —— 微服务领域（Chris Richardson / microservices.io）
   解决"无分布式事务下可靠投递"的标准答案。我们的 `events/notifications` outbox +
   `(source, external_id/batch_key)` 去重就是教科书实现。
2. **Event Sourcing + CQRS** —— `events` 不可变事件表 + `valuation_snapshots` 不可变快照 +
   `code_version` 重放，本质是事件溯源。交易系统是事件溯源最经典的应用域。
3. **PIT / no-look-ahead** —— `known_at = acceptedDate` 而非 `now()`，量化头号死罪防线。
4. **Backtest–Live Parity（同引擎）** —— 用 snapshot + code_version 保证可重放。
   NautilusTrader / LEAN / Zipline 的核心就是回测实盘跑同一套引擎。
   ⚠️ **v2 做回测时务必复用 analysis 的同一条事件处理路径**，别另写一套。
5. **Kappa 架构（pull→push 演进）** —— v1 批量 pull、v2 流式 push，正是批速分层。

### 1.5 成熟系统比我们多做的（按成长优先级）

1. **一条持久化日志（Kafka / NATS JetStream）当脊柱** —— 我们的 outbox 是它的"穷人版起步"。
   日志给你：多消费者扇出、按 key 有序、天然重放、回压。我们已预留"换 Pub/Sub、消费端契约不变"的口子。
2. **事件 Schema 注册 + 版本化（Avro/Protobuf + Schema Registry）** —— 我们有 envelope，
   但 event/signal 的结构契约需要显式版本化。冷路径系统最常见的生产事故是"上游悄悄改了字段形状"。
3. **Correlation ID / 分布式 tracing（OpenTelemetry）** —— 让一个 trace id 贯穿
   `event → notification → signal → outcome`，三跳之后调试"这个信号为什么生成"是刚需。
4. **死信队列（DLQ）** —— `reprocessStuck` 是它的手动版；毒丸消息应有正式隔离出口。
5. **Feature Store / Model Registry 的类比** —— `feedback_notes` 本质是轻量"在线经验存储"。
   做参数自调优/prompt 演化时会撞上 Feast/Tecton（特征库）、MLflow（模型注册）解决的同类问题。

### 1.6 可对标的真实系统

- **NautilusTrader**（开源，最贴近，详见 §2）
- **QuantConnect LEAN / Zipline / backtrader**：事件循环 + 回测实盘一致性经典范例
- **消息层光谱**：LMAX Disruptor（进程内超低延迟）→ Aeron / 多播（热路径网络）→
  Kafka / NATS（冷路径持久日志）。我们在最右端。
- **连接/执行层**：FIX 协议 + OMS/EMS（Charles River、FlexTrade）——做 live trading 再看。

### 1.7 小结

三服务划分 + HTTP+outbox + 事件溯源 + PIT，对"LLM 在环、低频、研究/信号型"系统来说，
踩中的全是冷路径成熟范式，没有为显得"分布式"而误用热路径技术。成长方向：① 持久日志替 outbox，
② 补 schema 版本化 + tracing，③ 接执行时务必加独立风控闸门。

---

## 2. NautilusTrader 深入介绍

**一句话**：开源、生产级、Rust 原生的事件驱动交易平台，最大卖点是"研究/回测/实盘用同一套引擎、同一份策略代码"。

### 2.1 基本事实（查证至 2026-05）

- 由 Nautech Systems 开发，**LGPL v3** 许可。
- 当前 **v1.227.0 Beta**（2026-05），约 1.9 万次提交、23k+ star，双周发布，仍处于 Beta（会有破坏性变更）。
- 语言：**Rust ~70% + Python ~24% + Cython ~6%**。哲学：**Python 当"控制面"**（写策略/配置/编排），
  **Rust 当高性能内核**，PyO3 绑定，装包不需要懂 Rust。
- 支持 Python 3.12–3.14、Rust 1.96+。

### 2.2 两个核心差异点

1. **回测=实盘的"代码零漂移"** —— 回测和实盘共用同一套 Engine + 同一份 Strategy 代码，
   唯一区别是底层喂数据的是历史回放还是真实行情/撮合。即 "research-to-production parity"。
2. **确定性事件驱动 + 纳秒时间模型** —— 统一时间模型，回测用模拟时钟、实盘用真实时钟，
   但**事件处理语义完全相同**。行情精度纳秒级，支持 quote/trade tick / bar / order book / 自定义数据。

### 2.3 架构：消息总线 + 一组 Engine + Actor 模型

所有组件不直接互相调用，**全部通过一条 MessageBus 通信**：

```
                    ┌─────────────── MessageBus ───────────────┐
                    │  (pub/sub + req/rep + point-to-point)     │
                    └───────────────────────────────────────────┘
   Adapters          DataEngine      Strategy/Actor     RiskEngine    ExecutionEngine    Adapters
 (行情/撮合 in) ──→  数据规整/分发  ──→  你的策略逻辑  ──→  下单前风控  ──→  订单管理  ──→ (报单 out)
                              ↕                    ↕              ↕
                            Cache (统一状态)        Portfolio (持仓/PnL)
```

关键构件（具体类名）：
- **NautilusKernel** —— 系统内核，装配/启停所有组件，是 `BacktestEngine` 和 `TradingNode`(实盘) 共享的核心。
- **MessageBus** —— 系统脊柱，三种消息模式：pub/sub、req/rep、point-to-point。组件间完全解耦。
- **Cache** —— 统一内存状态（订单/成交/持仓/行情/instrument），可选 Redis 持久化做容错恢复。
- **DataEngine** —— 接收各 adapter 行情，规整后通过总线分发。
- **RiskEngine** —— **下单前的独立风控闸门**（pre-trade risk），内核级强制组件。
- **ExecutionEngine** —— 订单生命周期管理（OMS 角色），对接各交易所 adapter。
- **Portfolio** —— 实时持仓与 PnL。
- **Actor / Strategy** —— 用户代码，通过 `on_bar`/`on_quote_tick`/`on_event` 回调响应总线事件。

**设计范式：Ports & Adapters（六边形架构）** —— 内核与具体交易所无关；每个交易所/数据源是一个 Adapter，
实现统一 `DataClient`/`ExecutionClient` 接口（port）。换交易所只换 adapter，内核和策略代码不动。

### 2.4 集成（24+ venue）

加密 CEX：Binance/Bybit/Coinbase/Deribit/Kraken/OKX；加密 DEX：dYdX/Hyperliquid/Derive/Lighter；
传统市场：Interactive Brokers；特殊市场：Betfair/Polymarket；数据源：Databento/Tardis。

### 2.5 订单能力（生产级判断指标）

TIF：IOC/FOK/GTC/GTD/DAY/AT_THE_OPEN/AT_THE_CLOSE；post-only、reduce-only、iceberg；
OCO/OUO/OTO contingency 订单。双精度：高精度 128-bit（16 位小数）+ 标准 64-bit（9 位小数）。

### 2.6 对我们的借鉴

**值得借鉴：** ① MessageBus 解耦（v2 换 Kafka/NATS 照它三模式设计契约）；② Ports & Adapters
（FMP 客户端/MCP/cache 收敛到统一 DataClient 接口）；③ 回测=实盘同引擎（v2 回测复用 analysis 同一路径）；
④ RiskEngine 作为内核级强制闸门（接 live trading 时照搬）。

**不必照搬：** 它是纳秒级、Rust 内核、进程内总线的低延迟设计；我们是 LLM 在环、秒~分钟级研究系统。
它的高精度时钟、Rust/Cython 优化、进程内 MessageBus 对我们过度设计。它也没有 LLM agent 层——这恰是我们的差异化。

---

## 3. LLM 作为交易策略的根本问题：前视污染

> ⚠️ 整个讨论中最重要的一节。质疑起点：传统量化策略是确定性代码，回测可信；我们的策略是 LLM 黑盒，
> 即使回测好，线上也未知。

### 3.1 把"黑盒"拆成三个独立问题

**问题 1：非确定性（同输入→不同输出）—— 最不致命。**
`temperature=0` 下方差很小（虽受浮点/batching 影响不能保证 bit 级一致）。我们已用 `emit_signal` 的
JSON schema + enum 强约束输出形状，又用确定性 reference valuation 当锚点——**LLM 是在确定性骨架里做有界判断**。
conviction 定义为"只是通知优先级、不是仓位"，单次误判爆炸半径有界。
> 治法：`temperature=0` + 把 **model_version + prompt_version + 完整 prompt/response** 一起写进
> `valuation_snapshots`。即使不能 bit 重放，至少**可审计**。

**问题 2：训练数据前视（look-ahead / 数据泄漏）—— 真正的杀手 🔴。**
LLM 独有、结构性、而且**我们现在的 PIT 设计治不了**。传统 Python 策略回测 2023 年 NVDA，
代码对结局一无所知。但 LLM 的**权重里**装着训练 cutoff 之前的全部历史——它"记得" NVDA 后来涨了。
所以回测时：

> 模型不是在"预测"，是在"回忆"。

这让回测结果**系统性虚高**，且**完全无法迁移到线上**（线上是 cutoff 之后模型没见过的未来）。

**关键、反直觉**：我们引以为傲的 PIT（`known_at = acceptedDate`）只保护**喂进去的输入数据**不前视，
**完全保护不了模型权重里的记忆**。把 2023 年财报按 PIT 喂进去，模型照样知道结局。
**PIT 护栏对确定性估值引擎有效，对 LLM 记忆无效。** 这是整个设计里最容易自我欺骗的地方。

**问题 3：模型漂移（策略被供应商"偷偷改掉"）。**
传统策略代码冻结；Anthropic 升级模型时我们的"策略"在不知情下变了。
**模型升级 = 策略变更**，必须重新验证、重新 baseline，旧 alpha 数据不能跨模型版本混看。

### 3.2 修正框架：轴不是"确定性 vs LLM"，是"泛化能力"

"确定性可知、LLM 完全未知"二分太绝对。一个过度拟合（curve-fit）的 Python 策略回测漂亮、线上照样死。
两者都会过拟合，真正的轴是"回测表现能不能泛化到样本外"。LLM 只是**多了问题 2 这个独有的、特别隐蔽的失败模式**。

> **对 LLM 策略，离线回测是"弱证据"，主因是训练数据前视，而非非确定性。验证重心必须从"离线回测"转移到"前向验证"。**

### 3.3 这恰是 evaluation 服务存在的意义

既然离线回测不可信，唯一诚实的验证是**前向、实时地跟踪信号结果**——这正是 evaluation 在做的：
- `signal_outcomes`（各 horizon 前向收益 + vs SPY 的 alpha）= **真·验证集**（跑在 cutoff 之后的真实未来上）
- conviction 校准 = 在线检验模型判断质量
- feedback 回流 = 在线学习

> **对 LLM 策略，paper trading / forward tracking 不是回测的补充，是回测的替代品。**

### 3.4 具体处方

1. **离线回测只在 cutoff 之后的数据上做。** cutoff 之前一切都被污染，直接当噪声扔掉。
2. **主验证手段改为前向 paper trading。** analysis 实时跑、evaluation 实时结算，攒够样本量再判断。
3. **分层验证**：确定性估值引擎（System A / 269 个单测的纯函数）正常回测/单测，完全可信；
   LLM 事件重定价层（System B）只能前向验证；别让 LLM 的不可验证性"污染"本来可信的确定性部分。
4. **把 model_version 当一等公民**：钉死版本、写进快照；模型升级强制重新 baseline。
5. **`temperature=0` + 结构化护栏**把方差压到最小。

---

## 4. 学界/业界定位与可行性的诚实评估

> 起点问题：这种"不依赖回测、依赖前向验证"的 LLM 策略设计，是否超前？是否会上线后获得好收益？有无类似研究？

### 4.1 "超前"吗？——不，这是个很拥挤的赛道

LLM 做交易策略是 2023 年以来最热的金融 AI 方向之一。**我们独立想到的 `feedback_notes` 检索增强设计，
基本就是 FinMem 的"分层记忆"架构。**
- **FinMem** (2023)：分层记忆 + 角色设定的 LLM 交易 agent，按 recency/relevancy/importance 检索记忆生成反思。
  跟我们 `read_recent_feedback` 几乎是同一个东西。
- **FinAgent** (2024)：多模态 + 工具增强推理 + 双层反思。
- **TradingAgents** (2024)：多 agent 协作（分析师/研究员/交易员/风控分角色）。
- **FINCON** (NeurIPS 2024)：多 agent + 概念性语言强化。
- 综述《LLM Agent in Financial Trading: A Survey》(2024)。

**结论**：方向不是超前，是"独立收敛到一个已被验证为合理的架构"。直觉对了，但不是新颖性，更不是护城河。

### 4.2 "依赖前向验证 = 会赚钱的优势"——框架错了

**前向验证不是设计的"特性/优势"，是 LLM 策略被迫接受的"约束"。** 它意味着在投入真金白银之前，
拥有的证据**更少**，而不是更多。传统策略上线前能用十几年历史做样本外检验、用统计显著性把握赔率。
我们不能，只能上线后慢慢攒前向样本。这是**劣势**，不是卖点。把"不依赖回测"当先进性，是把 bug 当 feature。

### 4.3 "上线后能获得好收益"——诚实说：大概率不能，至少无证据支持

- **Glasserman & Lin (2023)，《Assessing Look-Ahead Bias in Stock Return Predictions Generated By
  GPT Sentiment Analysis》**——直接证明 LLM 从新闻情感"提取"的预测能力很大一部分来自**前视偏差** +
  "distraction effect"。训练期与回测期重叠时，收益是**系统性虚高的假象**。
- **Lopez-Lira & Tang，《Can ChatGPT Forecast Stock Price Movements?》**——正是被上面这篇质疑的典型对象。

学界至今**没有可信的、经得起样本外检验的"LLM 选股稳定跑赢"的证据**。

诚实判断：
- ✅ **架构**合理、和前沿对齐（记忆/反思/反馈闭环）
- ✅ 我们对"前视污染 + 必须前向验证"的认识比很多发论文的人还清醒
- ❌ "会赚钱"这步**无任何证据支持，先验上应假设不赚钱**，直到 evaluation 攒出**统计显著的、
  cutoff 之后的、扣成本后的正 alpha**

### 4.4 真正区分"赚钱 vs 不赚钱"的，不是 LLM

LLM 只是信息处理器，不改变这几条铁律：
1. **样本外正 alpha 的统计显著性** —— 需要几十上百个独立信号样本把"运气"和"技能"分开。
2. **交易成本 / 滑点 / 容量** —— 很多纸面 alpha 扣成本归零。
3. **信息优势来源** —— 凭什么比市场快/准？公开信息可能在 LLM 跑完前已反映完。

### 4.5 小结

定位为**一个诚实的、可解释的 LLM 交易研究平台**，目标是"用 evaluation 闭环老老实实检验 LLM 到底有没有 edge"，
而不是"我设计了一个会盈利的系统"。前向跑半年攒出显著正 alpha，才是真信号。

---

## 5. 为什么用 LLM 而非硬编码 Python 策略（认知校准）

> 核心论点（原意）：ML/AI 模型本质上应远比硬代码策略先进；当前 AI 还很早期，未来处理的数据越多、
> 深度思考越强；它能在大量事实、新闻、宏观环境中"预测"而非"回测"；股价是未来而非历史；
> predict → 记录 → feedback → 回灌的循环会让系统越来越智能。

### 5.1 对的部分（扎实的直觉）

1. **LLM 能吃下硬代码吃不下的数据**：新闻、财报文本、管理层语气、地缘政治、利率、战争——非结构化异质信息，
   传统 Python 策略要么编码不了，要么需海量人工特征工程。LLM 把"特征工程"隐式化了。
2. **世界是非平稳的**：为某个 regime 写死的规则换个环境就失效；能对上下文推理的模型原则上能不改代码地适应。
3. **反馈闭环让系统"变聪明"**：确有研究支持（FinMem 的分层记忆/反思），即 in-context / retrieval learning。

### 5.2 错的 / 混淆的部分（必须纠正）

**混淆 1：把"策略"和"验证方法"对立了。** "Python 回测过去 vs LLM 预测未来"是假对立。
所有策略本质都在预测未来；回测是**验证一条预测规则在历史上是否成立，作为它未来是否成立的代理证据**。
预测未来是目标，回测是验证手段。LLM 不需要回测，是因为它**没法被有效回测**（前视污染）——缺陷逼出来的，不是优越性。

**混淆 2（最致命）：把"更先进"等同于"更能赚钱"。** 市场是对抗性的、（半）有效的。赚钱来源是
**差异化的信息或处理能力**，不是模型先进程度。人人能用 Claude 跑同一条新闻 → alpha 被瞬间套利掉，
先进模型带来**零相对优势**。最赚钱的量化基金（如 Renaissance）用相对"简单"的统计模型 + 独家数据 + 速度。
**先进性从来不是盈利的轴。**

**混淆 3：LLM 的训练目标恰与赚钱相反。** 要赢市场得**在共识错时正确地反共识**。但 LLM 在人类文本语料上训练，
**天然倾向复现共识观点**——而共识已被 price-in。这是结构性逆风。

**混淆 4："以后模型更强"是双刃的，且有天花板。** 别人同步拿到同样能力 → 相对 edge 被稀释；
利率/战争是**奈特不确定性**，本质不可预测，更聪明的模型不能把本质随机的东西变可预测；
"深度思考"在反应公开信息上反而是**延迟劣势**。

### 5.3 综合判断 + 定位结论

> LLM 真正可能的 edge **不是"预测更准"，而是"低成本的广度与综合"**：同时盯数百标的、跨多事件类型、
> 把财报+新闻+宏观揉成连贯 thesis，且便宜。这是**覆盖/规模优势**，不是单次下注更准的优势。
> 且只在**慢周期、判断密集、速度不重要、有信息/上下文优势**处成立。

**这不是 LLM vs 代码二选一，架构本就该是混合的**（System A 确定性估值 + System B LLM 重定价）。
**能用代码确定性表达的（估值、风控、仓位规则）就别交给 LLM**；LLM 只做它独有的非结构化综合层。
这个认知直接决定"哪层用 LLM、哪层用代码"的根本分工。

---

## 6. 业务层缺口：完整投资链路 vs 现有三服务

三子系统业务语义：`ingestion=感知 / analysis=决策 / evaluation=学习`，是干净的"感知→决策→学习"闭环（类 OODA）。
对照真实投资业务链路：

```
选什么看 → 产生想法 → 组合构建/定仓位 → 持仓管理 → 归因/学习
 (选股)     (analysis)    (缺)            (缺)        (evaluation)
```

有"想法"和"学习"，**但缺"组合构建/仓位"和"持仓管理"**。

- **组合/持仓缺口**："buy NVDA"在业务上不完整——不知道集中度、相关性、该下多大仓
  （conviction 明确说"只是通知优先级、不是仓位" → 根本没人决定仓位）、总资金多少。一串孤立信号 ≠ 被管理的组合。
- **持仓生命周期黑洞**：没有任何环节主动照看已开仓位（buy NVDA 后被降级，谁决定提前退出？）。
- **宏观/regime 缺席**：现流程纯自下而上，没有自上而下的宏观上下文统一调节所有信号。
- **选股缺位**：watchlist 靠手动 seed。
- **不建议减任何服务**；**反馈闭环应闭更多环**（同时回灌组合层和选股层）。

---

## 7. 发现/选股层（Universe Selection）具体设计

核心认知：**发现是和现有 puller 完全不同的访问模式**。`/pull/*` 是"给定 symbol → 拉它的事件"（窄而深）；
发现是"扫全市场 → 找出值得关注的 symbol"（宽而浅）。产物不是 events，而是 **watchlist 候选**。

### 7.1 它本身是一个漏斗（便宜的确定性过滤在前，贵的 LLM 在最后）

```
全市场 (~8000)
  ① 粗筛 scanners（确定性/便宜/市场级 FMP feeds）        → 候选池 candidates (~50–200)
  ② 复合打分 + 去重（确定性 composite score）            → top-N
  ③ (可选) LLM 轻量分诊 triage（单次便宜调用，非全 agent）→ 提名 nominees
  ④ 提升进 watchlist（人工确认 or 自动，带 TTL）          → watchlist → 现有 /pull/* 接手
```

### 7.2 Scanners（确定性市场级拉取，`/pull/mna` 已是雏形）

| Scanner | 信号 | FMP 市场级数据源 |
|---|---|---|
| 异常成交量 | 今日量 vs 20日均量 > 3x | most-actives / quote |
| 价格突破/动量 | gainers/losers、距 52 周高低点、vs ATR | gainers/losers |
| 分析师活动聚集 | 市场级评级/目标价变动 | grades / price-target-news |
| 新闻热度 | 窗口内某 symbol 文章数突增 | 市场级 news feed |
| 内部人聚集 | 同一标的多个内部人同向买入 | 市场级 Form4 |
| 财报意外 | earnings calendar + surprise 幅度 | earnings calendar |

### 7.3 关键设计点
- **打分去重**：被多个 scanner 同时点亮 > 只被 1 个点亮；初期固定权重；随时间衰减。
- **LLM 分诊位置**：⚠️ ingestion 无 LLM 铁律 → scanner+打分放 ingestion，LLM 分诊作为 analysis 侧
  轻量端点 `POST /triage`。
- **churn 控制（命门）**：发现进来的 watchlist 条目**带 TTL 过期**；`source` 字段区分
  `manual`(sticky) / `discovered`(ephemeral)；watchlist 设硬容量上限。
- **闭环**：evaluation 知道哪些 scanner/理由历史上产 alpha → 回灌打分权重。
- **新表**：`candidates(symbol, scan_date, reasons jsonb, composite_score, status, expires_at, source_scanners)`；
  watchlist 加 `source/added_at/expires_at/discovery_reason`。
- **归属**：v1 先作为 ingestion 内能力（`/scan/*` + candidates 表 + 提升 job）。

### 7.4 风险提示
- **selection bias**：只分析"已在动的标的" → 信号 condition 在动量上，污染 alpha 度量。
- **别变成追公开新闻的延迟输家**：发现的价值是慢周期覆盖广度，不是抢速度。
- **成本乘数**：watchlist 每多 1 个 symbol = 下游成本翻倍，TTL + 容量上限是必需品。

### 7.5 分阶段
P1：1–2 个确定性 scanner → candidates → 人工提升（零 LLM）；P2：复合打分+TTL自动提升+容量上限；
P3：analysis 加 LLM 分诊；P4：evaluation 反馈回灌权重。

---

## 8. 五件套标准命名 + 最省力落地

### 8.1 标准英文名（锚定 QuantConnect LEAN Algorithm Framework）

| 中文 | 标准英文名 | LEAN 对应 |
|---|---|---|
| 选股 | **Universe Selection**（Screening） | Universe Selection Model |
| 产生想法 | **Alpha / Signal Generation** | Alpha Model（产出 Insights） |
| 组合管理 | **Portfolio Construction**（含 position sizing） | Portfolio Construction Model |
| 持仓管理 | **Risk Management + Execution** | Risk + Execution Model |
| 回溯学习 | **Performance Attribution / Post-trade Analysis** | （研究层，不在运行时框架） |

现有三服务对应：ingestion=Data Feed 层；analysis=Alpha ✅；evaluation=Attribution ✅。

### 8.2 最省力落地（功能/表，非新服务的视角）

> 五件套里缺的三块绝大部分是**确定性函数 + 一两张表 + 接线**，不是新微服务。

| 要做的 | 形态 | 量级 |
|---|---|---|
| Portfolio Construction | 确定性 sizing 函数（固定分数 2%/仓、最多 N 仓、单板块上限）+ `positions` 表 | 小 |
| 持仓再决策 | 接线（持仓状态喂 analysis + sell 信号触发平仓） | 小 |
| 确定性退出（止损/止盈/到期） | **已存在**于 evaluation `/jobs/track` | 0 |
| Universe Selection P1 | 1 个 scanner + candidates 表 + 人工提升 | 小 |

> 注：§8.2 是"最省力"视角（往现有服务塞函数）。但用户更看重**职责清晰**，
> 最终方案见 §9（按状态归属切成 4 服务）。两者并不矛盾：§9 决定"功能归哪个服务"，§8.2 说明"功能本身很轻"。

---

## 9. 最终结论：下一版分布式系统设计（4 服务）

> ✅ 本 thread 的核心产出，用户认可。

### 9.1 切分原则（纠正一个根本认知）

服务的切分轴**不是"流水线有几个阶段"，而是"有几块被独立拥有的状态（state）"**。内聚性测试：
- **两个职责共享同一块状态 → 必须放同一个服务。** 拆开 = 两个服务抢同一张表 = "分布式单体"反模式，比不拆更糟。
- **各自拥有独立状态 + 独立决策节奏 → 才拆成两个服务。**

应用到 5 阶段：选股与 ingestion 共享"拉外部数据"本质 → **并入 ingestion**；
组合构建与持仓管理**共享同一张账本表** → **必须合一**；analysis、evaluation 各有独立状态 → 保持独立。
**结论：4 个服务（只新增 1 个 portfolio）。**

### 9.2 拓扑

```
┌─────────────┐   event    ┌──────────┐  view/signal  ┌───────────┐  position  ┌──────────────┐
│ ingestion   │ ─────────→ │ analysis │ ────────────→ │ portfolio │ ─────────→ │ evaluation   │
│ 感知 + 选股 │            │ 产生观点 │               │ 管账本    │            │ 学习         │
└─────────────┘            └──────────┘               └───────────┘            └──────────────┘
       ↑                         ↑                           ↑                         │
       └─── 选股权重回灌 ────────┴──── 信号上下文回灌 ───────┴──── 仓位校准回灌 ──────┘
                                          (feedback)
```

### 9.3 职责与状态归属（每张表只有拥有它的服务能写）

| 服务 | 一句话职责 | 独占状态 |
|---|---|---|
| **ingestion** | 世界发生了什么 + 谁值得看 | events, notifications, candidates, watchlist |
| **analysis** | 这对某标的意味着什么观点（买/卖/持），**无状态、不知账本** | valuation_snapshots, trading_signals |
| **portfolio**（新） | 下多大注 + 已开的仓怎么管（建/加/减/平/生命周期） | positions / book |
| **evaluation** | 做得对不对、学到了什么 | signal_outcomes, feedback_notes |

### 9.4 让它"好理解"的核心一刀

> **analysis 只产生"观点"（view），对账本一无所知、无状态；portfolio 拥有账本，负责把观点翻译成账本动作。**

- analysis 永远只答："现在我对 NVDA 怎么看？"（不管持没持仓）
- portfolio 看着账本决定："鉴于已持有 NVDA，这个 sell 观点 → 平掉/减半/不动"

一刀解决三事：① analysis 保持无状态（好测好重放）；② 填上"开了仓没人管"的黑洞；
③ 持仓期新事件走 `ingestion→analysis(重新出观点)→portfolio(对账本决策)`，**复用现有管线，无需新机制**。

### 9.5 顺手修好的现存模糊

现 evaluation 职责不纯（混了"管生命周期止损止盈" + "算 alpha" + "复盘学习"）。新设计：
**"管生命周期"搬去 portfolio**（它是账本决策），evaluation 只留"量 + 学"，变成**纯学习层**。
重构不只是加服务，也削清了现有边界。

### 9.6 业界验证（LEAN 映射）

ingestion = Data + Universe Selection；analysis = Alpha；
portfolio = Portfolio Construction + Risk Management + Execution；evaluation = Performance Attribution。

### 9.7 诚实的代价与纪律

- 多 1 个服务 = 多 1 跳 outbox（analysis→portfolio→evaluation）、多 1 个部署单元、多 1 套幂等去重。
  为"职责清晰"付的运维税，用户认可值。
- **铁律**：每张表只有拥有它的服务能写，别人只能通过 API/事件读。否则退化为"共享数据库的分布式单体"——
  真假分布式系统的分水岭。
- **别再多拆**：4 个是当前甜点。只有当选股做大（自成独立状态/节奏）才在 v3 把 discovery 抽成第 5 服务。

---

## 10. 参考文献

- FinMem: A Performance-Enhanced LLM Trading Agent with Layered Memory and Character Design — arXiv 2311.13743
- TradingAgents: Multi-Agents LLM Financial Trading Framework — arXiv 2412.20138
- FINCON: A Synthesized LLM Multi-Agent System — NeurIPS 2024
- Large Language Model Agent in Financial Trading: A Survey — arXiv 2408.06361
- Glasserman & Lin, Assessing Look-Ahead Bias in Stock Return Predictions Generated By GPT Sentiment Analysis — arXiv 2309.17322 / SSRN 4586726
- Lopez-Lira & Tang, Can ChatGPT Forecast Stock Price Movements? Return Predictability and Large Language Models
- NautilusTrader — https://github.com/nautechsystems/nautilus_trader
- QuantConnect LEAN Algorithm Framework — https://www.quantconnect.com/docs/
