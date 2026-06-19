---
paths:
  - "packages/shared/src/db/**/*.ts"
  - "packages/shared/drizzle.config.ts"
  - "packages/shared/drizzle/**"
  - "scripts/dbstate.ts"
---

# 数据库（Neon + Drizzle）

schema 真源是 `packages/shared/src/db/schema.ts`（唯一权威，无另册总览）。

## 表命名（子系统前缀）

- 所有表按**写入 owner 子系统**加前缀：`data_*` / `alpha_*` / `portfolio_*` / `system_*`（如 `data_events`、`alpha_trading_signals`、`portfolio_positions`、`system_logs`）。浏览/迁移时一眼看清归属。owner 见 `services.md` 的「状态归属」。
- 前缀只设在 `pgTable("名")` 上；**导出的 Drizzle 变量名（`events`/`newsItems`…）与索引名保持不变**，所以服务代码引用的是表对象、不碰裸表名。唯一的裸表名硬编码在 `log-sink.ts`（`INSERT INTO system_logs`）。

## 迁移流程

- 改 `schema.ts` 后：`pnpm db:generate`（drizzle-kit 生成 `packages/shared/drizzle/*.sql`）→ review 生成的 SQL → `pnpm db:migrate` 应用。
- **一般不要手写迁移 SQL**，也不要直接改已生成的迁移文件；通过改 schema 重新生成。
- **例外：表/列重命名**。drizzle-kit 的 rename 解析需要交互式 TTY（本仓非交互环境会报 `Interactive prompts require a TTY`），所以重命名只能**手写迁移**：`ALTER TABLE/RENAME`（保数据，绝不 drop+create），复合主键表还需 `RENAME CONSTRAINT`（PK 约束名内嵌表名）；同时手改对应的 `drizzle/meta/00NN_snapshot.json` + `_journal.json` 保后续 `db:generate` 干净。参考 `drizzle/0001_*`、`0011_*`。
- `db:migrate` / `dbstate.ts` 等脚本通过 `--env-file=../../.env`（或 `.env`）拿 `DATABASE_URL`。新增需要 DB 的脚本记得带上 env-file。

## 连接

- 统一用 `db()` / `getPool()`（`@qt/shared/db` → `src/db/client.ts`），走 Neon **pooled** 连接串。不要在别处自建连接池。
- schema 引用：服务里用 `dbSchema`（`import { dbSchema } from "@qt/shared"`）取表对象。

## 数据建模约定

- **PIT 正确性**：财报类数据带 `known_at`，值 = FMP `acceptedDate`，**不是** `now()`。查询历史状态要按 `known_at` 过滤。事件记录缓存（`data_ratings`/`data_price_targets`）带 `observed_at` = 记录公开时刻。
- 幂等键：`data_events` 等表用唯一约束 `(source, external_id)` 支撑去重 + outbox；事件记录缓存用复合 PK `(symbol, external_id)`。
- **读穿缓存新鲜度**：周期性财报/价格缓存靠最新行龄判新鲜（`isStatementFresh`/`isPriceFresh`）；稀疏事件源（ratings/price_targets，"无新记录"是常态）改用 `data_marketdata_fetches` 的 per-(symbol,dataset) TTL 取数水位，空取也推进水位。这些 `data_*` 缓存经 `@qt/shared/marketdata` 读穿写入，data 分诊预热为主、alpha 读穿回填为辅。
- outbox 状态机：`data_events.status` = `pending | processing | done`，另有 `delivery_status`；`alpha_signal_deliveries` 同理。
- **金额一律存原始数字**（不做四舍五入/单位换算），展示层再格式化。
- 版本化/可重放：`data_valuation_snapshots` 等不可变表带 `code_version`；嵌套数据用 JSONB。

## Drizzle upsert / ON CONFLICT 细则

- **批量 upsert 引用待插入值用 `excluded.<列>`**：`onConflictDoUpdate({ set })` 的值不能引用某一行（批量时没有"那一行"），要用 `sql.raw(\`excluded.${col}\`)`。惯例：`const ex = (c: string) => sql.raw(\`excluded.${c}\`)`，再 `set: { navIndex: ex("nav_index") }`。参考 `services/data/src/holdings/sync.ts`。
- **复合主键含可空列 → ON CONFLICT 不命中**：PG 把 NULL 视作互不相等，可空键列上的 upsert 会退化成重复插入/不更新。把这类键列设 `notNull().default(<哨兵>)`（`''` / `0` / `'1970-01-01'`），写入时显式填哨兵。见 `data_holdings_positions` 的 `option_type`/`strike`/`expiry`。
- **未提交的新空表要改名/改结构**：drop 表 + 删对应 `drizzle/00NN_*.sql` 与 `meta/00NN_snapshot.json` + 回退 `_journal.json` 末条 + 重 `db:generate`，比手写 rename 干净——**仅限**未进 main、无数据时；已上线的表仍按上面「表/列重命名」手写 ALTER。

## 手测脚本：别动真实行

本仓只有一个 Neon 库（无独立测试库），临时 seed/cleanup 脚本直接打的是**共享真实数据**。教训（holdings 验证时险些误删真实快照）：

- **用一次性键，别复用真实键**：seed 走一个抛弃式 `account_id`/`symbol`（如 `'smoke-test'`），别用真实值（`'me'`）——否则 cleanup 的 `DELETE ... WHERE account_id='me' AND date IN (...)` 可能删到真实行。
- **优先事务回滚**：`await db().transaction(async (tx) => { …seed…; …assert…; throw ROLLBACK })`，验证完自动不落库，比手写 cleanup 更安全。
- cleanup 的 `DELETE` 一定带能唯一锁定测试行的谓词（你插入时用的哨兵 token / 一次性 id），**绝不**按"日期区间"等可能撞真实数据的宽条件删。
- 跑前先 `SELECT` 一眼目标表有没有真实数据（`data_holdings_*` 等实盘表尤其）；脚本用完即删，不要 commit。
