# Quant Trading System

事件驱动的分布式量化交易系统。三个独立 HTTP 服务组成闭环：

```
外部源 → ingestion → (event) → analysis → (signal) → evaluation → (feedback) ↺
```

栈：TypeScript + Hono + Neon(Postgres) + Drizzle + Anthropic Agent SDK。pnpm workspaces 单仓库。

**架构基准是 [docs/architecture.md](docs/architecture.md)** —— 任何涉及服务边界、数据流、estim/估值分层、schema 的问题先读它，本文件不复制其内容。

## 命令

```bash
pnpm install
cp .env.example .env          # 填 DATABASE_URL / ANTHROPIC_API_KEY / FMP_API_KEY

pnpm db:generate              # 改了 schema 后生成迁移 SQL
pnpm db:migrate               # 应用迁移

pnpm dev                      # 一键起全部服务（本地 tsx 热重载）
pnpm dev:ingestion            # 单起 → :8081
pnpm dev:analysis             # 单起 → :8082
pnpm dev:evaluation           # 单起 → :8083
pnpm dev:portfolio            # 单起 → :8084

pnpm typecheck                # 全仓 tsc --noEmit；提交前必跑
pnpm test                     # 全仓 vitest（纯函数单测，不碰 FMP/DB）；CI 也跑
pnpm build                    # 全仓 tsc 构建

pnpm up                       # docker-compose 全栈（host 8081/8082/8083/8084）
pnpm down
```

本地 dev 端口固定为 ingestion 8081 / analysis 8082 / evaluation 8083 / portfolio 8084（脚本里用 `PORT=` 指定）。`.env` 里的 `ANALYSIS_URL` / `EVALUATION_URL` / `PORTFOLIO_URL` 是本地 dev 的 localhost 值；docker-compose 在 compose 文件内用容器主机名覆盖它们。

## 仓库结构

- `packages/shared` —— 领域类型 / envelope / config / db(schema+client) / fmp 客户端 / http 工具。被各服务作为 `@qt/shared` workspace 依赖引用。
- `services/ingestion` —— 外部数据唯一接收者（v1 只做定时 pull），无 LLM。
- `services/analysis` —— **唯一的真 LLM agent**：事件 → 交易信号。
- `services/evaluation` —— 信号结算（确定性）+ LLM 复盘 + 反馈库；登记信号后经 outbox 转投 portfolio。
- `services/portfolio` —— **`positions` 账本唯一 owner**（T6）：接收 evaluation 转投的信号 → 确定性 sizing → 写 positions，无 LLM。

## 全局铁律（细则见 `.claude/rules/`）

- **ESM / NodeNext**：相对导入必须带 `.js` 后缀（即使源码是 `.ts`）。
- **响应 envelope**：每个 HTTP 端点都返回 `ok(data)` / `fail(code, msg)`（`@qt/shared`），不要手写裸 JSON。
- **config 惰性 getter**：env 通过 `config.xxx()` 读取，缺必填项在调用处 fail-fast；不要在模块顶层读 `process.env`。
- **服务间通信**：`deliverJson` + DB outbox（at-least-once）。生产者在同一事务里写业务数据 + outbox 行（`pending`），提交后再投递；消费端按 `(source, external_id)` 幂等去重。
- **PIT 正确性**：金融数据落库时 `known_at = FMP acceptedDate`，绝不用 `now()`。
- **金额存原始数字**，展示层再格式化；可重放性靠 `code_version` + 不可变快照。

## Git / 分支工作流（铁律）

> 踩过两次坑：① 基于**陈旧的本地 `main`** 切分支（落后 origin 8 个提交）；② 在 PR **已合并**的分支上继续提交，导致修复搁浅、进不了 main。以下规则用来杜绝。

- **切分支前必 `git fetch`，且基于 `origin/main` 而非本地 `main`**：
  `git fetch origin && git checkout -b <type>/<topic> origin/main`。
  绝不假设本地 `main` 是最新的。
- **往已有分支追加提交前，先确认它的 PR 没合并**：
  `gh pr view <branch> --json state,mergedAt`（或 `gh pr list --head <branch>`）。
  若 `state=MERGED`/`CLOSED` → **不要再提交**，从最新 `origin/main` 另开新分支做后续工作。
- **PR 合并 = 该分支生命周期结束**。任何后续改动（评审修复、补丁、follow-up）都走**新分支 + 新 PR**，不复用旧分支。
- **救已搁浅在死分支上的提交**：从 `origin/main` 切新分支 → `git cherry-pick <那些 commit>` → push → 开新 PR。
- 分支命名：`feat/*`（新功能）、`fix/*`（修复）；提交信息按现有中文 conventional commit 风格。

## 按目录加载的细则

编辑对应区域时 Claude 会自动载入：

- `.claude/rules/typescript.md` —— TS/ESM 编码规范（`**/*.ts`）
- `.claude/rules/services.md` —— Hono 服务 / 端点 / outbox 投递约定（`services/**`）
- `.claude/rules/analysis-agent.md` —— Agent SDK、工具集、emit_signal 护栏（`services/analysis/**`）
- `.claude/rules/database.md` —— Drizzle schema / 迁移流程 / PIT（`packages/shared/src/db/**` 等）

## 当前阶段

见 architecture.md §10。当前：**M0 骨架**（三服务 health 端点 + 本地/容器起得来）。
