# T7 — Portfolio Construction（确定性仓位 sizing）详细方案

> 日期：2026-05-31 · 关联：Issue #44 · Roadmap：[`../distributed-v2-roadmap.md`](../distributed-v2-roadmap.md) T7（P0 最高优先级）
> 讨论存档：[`../discussions/2026-05-31-distributed-architecture.md`](../discussions/2026-05-31-distributed-architecture.md) §9
> 状态：方案草案，待确认 §9 的几个决策后开工。

## 0. 目标与非目标

**目标**：把"一串孤立的 trading_signal"变成"一个被管理的纸面账本（paper book）"。引入一个
**确定性的 sizing 函数**（纯函数）+ 一张 `positions` 表，让每个被采纳的信号带上"下多大注"，
并受组合级约束（最大持仓数、单票上限、板块上限、现金约束）。这让 evaluation 的 alpha 归因第一次有业务意义
（"按这个仓位真实跑，组合收益是多少"，而不是"每个信号孤立地对不对"）。

**为什么它是 P0**：收益/成本比最高——纯确定性、低风险、不依赖任何服务重构，能立刻落地（§9 / roadmap）。

**非目标（明确排除，留给后续任务）**：
- ❌ 卖出/退出动作作用于账本（属 T8 生命周期 + T10 持仓再决策）
- ❌ 真实相关性矩阵（v1 用 sector 作相关性代理）
- ❌ 做空 / 杠杆（v1 **long-only**）
- ❌ 再平衡 / 加减仓（v1 一个信号 = 最多开一个新仓，重复 symbol 去重不加仓）
- ❌ 真实下单执行（始终是 paper book）
- ❌ 多账本（v1 单一账本，常量资本）

## 1. 设计原则

1. **纯函数 + DB I/O 分离**：sizing 逻辑是 `(signal, book, params) → decision` 的**纯函数**，
   放 `@qt/shared`，不碰 DB/FMP。调用处（v1 在 evaluation）负责读账本、查 sector、落库。
   → 单测零依赖（符合 `pnpm test` 纯函数约定），且批次 2 迁入 portfolio 服务时**函数不动，只换调用处**。
2. **确定性、可解释**：每个决策附带 `reasons[]`（为什么是这个仓位 / 为什么拒绝），便于复盘与审计。
3. **幂等**：sizing 按 `signalId` 唯一——一个信号最多产生一个 position 行，重投不重复建仓。
4. **现金/资本确定性派生**：v1 不维护可变的 `cash` 行（避免并发竞争），
   `cash = PORTFOLIO_CAPITAL - Σ(open positions 的 notional)`，每次 sizing 时即时算。

## 2. 数据模型

### 2.1 新增 `positions` 表（schema.ts）

```ts
export const positions = pgTable(
  'positions',
  {
    id: serial('id').primaryKey(),
    signalId: integer('signal_id').notNull(),     // 入场信号；唯一 → 幂等
    symbol: text('symbol').notNull(),
    direction: text('direction').notNull(),        // v1 恒为 'buy'（long-only）
    status: text('status').notNull().default('open'), // open | closed
    // —— sizing 结果（开仓时确定，不可变快照）——
    targetWeight: doublePrecision('target_weight'),   // 占总资本比例 0..1
    targetNotional: doublePrecision('target_notional'),
    entryPrice: doublePrecision('entry_price'),
    shares: doublePrecision('shares'),                // notional / entryPrice
    sectorAtEntry: text('sector_at_entry'),           // 开仓时的板块快照（板块上限用）
    sizingReasons: jsonb('sizing_reasons'),           // string[]，可解释
    sizingParams: jsonb('sizing_params'),             // 当时的 params 快照，可重放
    // —— 平仓（留空，T8 填）——
    closedAt: timestamp('closed_at', { withTimezone: true }),
    exitPrice: doublePrecision('exit_price'),
    realizedReturn: doublePrecision('realized_return'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uqSignal: uniqueIndex('uq_positions_signal').on(t.signalId), // 一信号一仓，幂等
    idxStatus: index('idx_positions_status').on(t.status),
    idxSymbol: index('idx_positions_symbol').on(t.symbol),
  }),
);
```

设计取舍：
- **不新增可变的 `portfolio` 单行表**（capital/cash）。资本用 config 常量，现金即时派生（§1.4）。
  realized PnL 由 evaluation 后续按 positions 聚合，不在 sizing 路径维护。保持 sizing 路径无副作用竞争。
- `sectorAtEntry` 落快照而非每次 join universe：板块归类可能变，开仓时点的板块才是约束依据（PIT 思想）。
- `sizingParams` 落快照：参数会调，重放时要知道"当时按什么参数定的仓"（呼应 code_version 可重放原则）。

### 2.2 迁移

改完 `schema.ts` 后：`pnpm db:generate`（生成迁移 SQL）→ `pnpm db:migrate`（应用）。
（`watchlist` 的 `source/TTL` 等列属 T13，不在本任务。）

## 3. 纯函数：`@qt/shared` 的 sizing

新文件 `packages/shared/src/portfolio/sizing.ts`：

```ts
export interface SizingParams {
  capital: number;                          // 总纸面资本
  sizeByConviction: { low: number; medium: number; high: number }; // 各 conviction 的基础权重
  maxPositions: number;                     // 最大同时持仓数
  maxWeightPerName: number;                 // 单票权重上限
  maxSectorWeight: number;                  // 单板块权重上限
}

export interface OpenPosition {            // 账本里已开的仓（喂给函数的最小投影）
  symbol: string;
  sector: string | null;
  targetNotional: number;
}

export interface SizingInput {
  signal: {
    id: number;
    symbol: string;
    direction: 'buy' | 'sell' | 'hold';
    conviction: 'low' | 'medium' | 'high' | null;
    entryPrice: number | null;
  };
  sector: string | null;                   // 调用处从 universe 查到，传入（保持纯）
  book: OpenPosition[];                     // 当前 open 仓位
  params: SizingParams;
}

export type SizingDecision =
  | { action: 'open'; targetWeight: number; targetNotional: number; shares: number; reasons: string[] }
  | { action: 'reject'; reasons: string[] };

export function sizePosition(input: SizingInput): SizingDecision;
```

### 3.1 决策规则（确定性，按顺序短路）

| 顺序 | 规则 | 不满足时 |
|---|---|---|
| 1 | **方向闸门**：v1 long-only，仅 `direction==='buy'` 开仓 | reject（`non_buy_direction`） |
| 2 | **价格校验**：`entryPrice` 存在且 > 0 | reject（`missing_entry_price`） |
| 3 | **去重**：`symbol` 不在当前 book | reject（`already_holding`，v1 不加仓） |
| 4 | **持仓数上限**：`book.length < maxPositions` | reject（`max_positions_reached`） |
| 5 | **基础仓位**：`base = sizeByConviction[conviction ?? 'low']`（缺省按 low 最保守） | — |
| 6 | **单票上限**：`w = min(base, maxWeightPerName)` | trim（记 `capped_per_name`） |
| 7 | **板块上限**：`sectorNow + w ≤ maxSectorWeight`，否则 `w = maxSectorWeight - sectorNow` | w≤0 → reject（`sector_cap_reached`）；否则 trim（`capped_by_sector`） |
| 8 | **现金约束**：`cash = capital - Σbook.notional`；`notional = min(w*capital, cash)` | notional≤0 → reject（`no_cash`）；否则 trim（`capped_by_cash`） |
| 9 | **成股**：`shares = notional / entryPrice` → `action: open` | — |

- `sectorNow = Σ(book 中同 sector 的 targetNotional) / capital`。
- 所有 trim 都记进 `reasons[]`，最终权重是各上限取 min 后的结果。
- conviction 为 null → 视作 `low`（最保守），不报错。

### 3.2 为什么 sizing-by-conviction 而非纯固定分数

讨论 §5.1 提醒"conviction 只是通知优先级、不是仓位"——但那是指**LLM 不应直接决定仓位大小**。
这里 conviction → 权重的**映射是确定性的、由 config 固定的**，不是 LLM 自由发挥。即：LLM 给"有多确信"，
**代码**决定"这对应多大注"。符合"确定性可表达的用代码"原则。若要更保守，把三档设成相同值即退化为固定分数。

## 4. 配置（config 惰性 getter）

在 evaluation（批次 1）/ portfolio（批次 2）的 `config.ts` 加（默认值，env 可覆盖）：

| getter | env | 默认 |
|---|---|---|
| `config.portfolioCapital()` | `PORTFOLIO_CAPITAL` | `100000` |
| `config.sizeByConviction()` | `SIZE_LOW/SIZE_MED/SIZE_HIGH` | `0.01 / 0.02 / 0.03` |
| `config.maxPositions()` | `MAX_POSITIONS` | `20` |
| `config.maxWeightPerName()` | `MAX_WEIGHT_PER_NAME` | `0.05` |
| `config.maxSectorWeight()` | `MAX_SECTOR_WEIGHT` | `0.30` |

遵循铁律：不在模块顶层读 `process.env`；缺省值在 getter 内提供，不 fail-fast（这些都有合理默认）。

## 5. 集成点（批次 1：临时落在 evaluation `/signals`）

> 现状：`POST /signals` → zod 校验 → 按 signalId 幂等 → `repo.insertTrackedSignal`。
> 改动：在登记跟踪后，追加一步 sizing + 落 positions。

```
POST /signals
  ├─ 校验 + 幂等（不变）
  ├─ repo.insertTrackedSignal(sig)              （不变）
  └─ 【新增】sizeAndRecord(sig):
       ├─ book   = repo.loadOpenBook()           // SELECT positions WHERE status='open'
       ├─ sector = repo.lookupSector(sig.symbol) // SELECT sector FROM universe
       ├─ params = 从 config 组装 SizingParams
       ├─ decision = sizePosition({ signal, sector, book, params })  // 纯函数
       └─ if decision.action==='open':
            repo.insertPosition({ signalId, symbol, direction, ...decision, sectorAtEntry: sector, sizingParams: params })
              .onConflictDoNothing()             // 幂等：uq_positions_signal
          else: 记 reject（仅日志 / 可选落一张 sizing_log，v1 先只日志）
```

要点：
- **响应仍返回 `ok(...)`**，可在 data 里带 `{ tracked: true, position: 'opened'|'rejected', reasons }`，便于观测。
- sizing 失败/拒绝**不应使 `/signals` 失败**（信号跟踪与建仓是两件事，建仓拒绝是正常业务结果）。
- ⚠️ **这是临时位置**：它让 evaluation 暂时既"学习"又"建账本"，违反 §9 的纯学习层目标——
  这是有意识的过渡（roadmap 批次 1→2）。批次 2（T6/T9/T11）把 `sizeAndRecord` 调用 + `positions`
  所有权迁入新的 **portfolio 服务**，evaluation 回归纯学习。**纯函数 `sizePosition` 届时零改动。**

## 6. 测试计划（vitest 纯函数，零 DB/FMP）

新文件 `packages/shared/src/portfolio/sizing.test.ts`，表驱动用例：

1. buy + high conviction + 空账本 → open，weight=0.03
2. conviction=null → 按 low（0.01）
3. sell / hold → reject（non_buy_direction）
4. entryPrice 缺失或 ≤0 → reject（missing_entry_price）
5. 已持有同 symbol → reject（already_holding）
6. 账本已 maxPositions 个 → reject（max_positions_reached）
7. base > maxWeightPerName → trim 到上限（capped_per_name）
8. 板块已接近上限 → trim（capped_by_sector）；已满 → reject（sector_cap_reached）
9. 现金不足 → trim（capped_by_cash）；无现金 → reject（no_cash）
10. 多约束叠加取 min（per-name + sector + cash 同时触发，验证最终 weight 正确 + reasons 完整）
11. shares = notional / entryPrice 计算正确

集成层（evaluation）：可选加一个轻量测试验证幂等（同一 signalId 调两次只建一仓）——但需 DB，
按现有约定（test 不碰 DB）改为在 PR 手测说明里覆盖，或用内存桩。

## 7. 交付物清单

- [ ] `packages/shared/src/db/schema.ts`：新增 `positions` 表 + 导出
- [ ] `packages/shared/src/portfolio/sizing.ts`：纯函数 + 类型
- [ ] `packages/shared/src/portfolio/sizing.test.ts`：单测（覆盖 §6）
- [ ] `packages/shared/src/index.ts`：导出 `sizePosition` 等
- [ ] `services/evaluation/src/config.ts`：5 个 sizing config getter
- [ ] `services/evaluation/src/repo.ts`：`loadOpenBook` / `lookupSector` / `insertPosition`
- [ ] `services/evaluation/src/routes.ts`：`/signals` 追加 `sizeAndRecord`
- [ ] 迁移：`pnpm db:generate` + `pnpm db:migrate`
- [ ] `pnpm typecheck` + `pnpm test` 通过

## 8. 需要你拍板的决策（带推荐默认）

1. **资本基数**：纸面总资本默认 **$100,000**？（只影响 notional 绝对值，weight 不受影响）
2. **sizing 方案**：**conviction 分档（1%/2%/3%）** vs 纯固定分数（如统一 2%）？推荐分档（§3.2）。
3. **long-only 确认**：v1 只做 buy 开仓、忽略 sell/hold 对账本的影响？推荐是（退出归 T8/T10）。
4. **重复 symbol**：已持有时**去重不加仓**（推荐，最简）vs 允许加仓到上限？
5. **拒绝是否落库**：被 sizing 拒绝的信号，v1 **只记日志**（推荐）vs 落一张 `sizing_log` 表留痕？

> 默认值我已写进方案（§3/§4）。若无异议我按默认开工；有要改的点告诉我即可。
