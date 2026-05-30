---
paths:
  - "packages/shared/src/db/**/*.ts"
  - "packages/shared/drizzle.config.ts"
  - "packages/shared/drizzle/**"
  - "scripts/dbstate.ts"
---

# 数据库（Neon + Drizzle）

schema 总览见 [docs/architecture.md](../../docs/architecture.md) §8。schema 真源是 `packages/shared/src/db/schema.ts`。

## 迁移流程

- 改 `schema.ts` 后：`pnpm db:generate`（drizzle-kit 生成 `packages/shared/drizzle/*.sql`）→ review 生成的 SQL → `pnpm db:migrate` 应用。
- **不要手写迁移 SQL**，也不要直接改已生成的迁移文件；通过改 schema 重新生成。
- `db:migrate` / `dbstate.ts` 等脚本通过 `--env-file=../../.env`（或 `.env`）拿 `DATABASE_URL`。新增需要 DB 的脚本记得带上 env-file。

## 连接

- 统一用 `db()` / `getPool()`（`@qt/shared/db` → `src/db/client.ts`），走 Neon **pooled** 连接串。不要在别处自建连接池。
- schema 引用：服务里用 `dbSchema`（`import { dbSchema } from "@qt/shared"`）取表对象。

## 数据建模约定

- **PIT 正确性**：财报类数据带 `known_at`，值 = FMP `acceptedDate`，**不是** `now()`。查询历史状态要按 `known_at` 过滤。
- 幂等键：`events` 等表用唯一约束 `(source, external_id)` 支撑去重 + outbox。
- outbox 状态机：`events.status` = `pending | processing | done`，另有 `delivery_status`；`signal_deliveries` 同理。
- **金额一律存原始数字**（不做四舍五入/单位换算），展示层再格式化。
- 版本化/可重放：`valuation_snapshots` 等不可变表带 `code_version`；嵌套数据用 JSONB。
