# Quant Trading System

事件驱动的分布式量化交易系统。三个独立 HTTP 服务：

```
新闻源 → data (初筛+分诊+缓存预热) → (event) → alpha (重定价) → (signal) → portfolio (sizing + 开/平仓结算)
```

栈：TypeScript + Hono + Neon(Postgres) + Drizzle + Anthropic SDK（Messages API，非 Agent SDK）。pnpm workspaces 单仓库。

**编码硬约束在 `.claude/rules/`**（按目录自动加载，见文末）；schema 真源是 `packages/shared/src/db/schema.ts`。设计讨论 / 路线图 / 任务状态一律用 **GitHub issues**（不再维护 `docs/` —— 它易和代码脱节）。服务边界与数据流见下方拓扑图 + 仓库结构。

## 命令

```bash
pnpm install
cp .env.example .env          # 填 DATABASE_URL / ANTHROPIC_API_KEY / FMP_API_KEY

pnpm db:generate              # 改了 schema 后生成迁移 SQL
pnpm db:migrate               # 应用迁移

pnpm dev                      # 一键起全部服务（本地 tsx 热重载）
pnpm dev:data                 # 单起 → :8081
pnpm dev:alpha                # 单起 → :8082
pnpm dev:portfolio            # 单起 → :8084

pnpm typecheck                # 全仓 tsc --noEmit；提交前必跑
pnpm test                     # 全仓 vitest（纯函数单测，不碰 FMP/DB）；CI 也跑
pnpm build                    # 全仓 tsc 构建

pnpm up                       # docker-compose 全栈（host 8081/8082/8084）
pnpm down
```

本地 dev 端口固定为 data 8081 / alpha 8082 / portfolio 8084（脚本里用 `PORT=` 指定）。`.env` 里的 `ALPHA_URL` / `PORTFOLIO_URL` / `DATA_URL` 是本地 dev 的 localhost 值；docker-compose 在 compose 文件内用容器主机名覆盖它们。

## 仓库结构

- `packages/shared` —— 领域类型 / envelope / config / db(schema+client) / fmp 客户端 / http 工具。被各服务作为 `@qt/shared` workspace 依赖引用。
- `services/data` —— 外部数据唯一接收者，**news 驱动**(issue #59)：`/news/pull` 拉市场新闻入 staging 并**后台自动对新增行跑 triage**；triage 每条先 profile 初筛（市值≥$1B 等，不过 → 标 `low`，不进 LLM）→ 过筛者**确定性预热**该 symbol 的 marketdata 缓存（读穿）→ Haiku agent 定级 high/med/low → 人工在仪表板审核 → `/news/notify` 投 alpha。`/news/triage` 端点保留作重试 sweep。含**一处轻量 LLM**（仅 news 定级）；其余确定性。也含**确定性 reference valuation 引擎**(`src/valuation/`，无 LLM，从 marketdata 算 fair value → `data_valuation_snapshots`；`/internal/valuation`)、**per-user 自选** `data_watchlist`(每用户私有;data 拥有写,web forward add/remove)、**选股发现 scanner**(`/scan/*` → `data_candidates`,只读发现队列)、**13F 传奇投资人季度持仓**(issue #99，`src/thirteenf/`，从 SEC EDGAR 自解析 13F-HR → `data_13f_holdings` 不可变季度快照；`/jobs/sync-13f`；CUSIP→ticker 走自维护表 `data_13f_cusip_map`)。也含 **symbol-centric SEC 研究三件套**(都 per-symbol 直连 SEC，喂 symbol 详情页 tab + MCP `get_symbol_research`)：**13D/13G 举牌/大股东**(`src/ownership/` → `data_ownership_filings`，roster 驱动；#105/PR#129)、**8-K 重大事件**(`src/eightk/` → `data_8k_filings`，item code 取自 submissions、无需解析正文；`/jobs/pull-8k`；#103/PR#131；接 alpha 重定价的 8-K→event 见 #130)、**Form 4 内部人交易**(`src/form4/` → `data_form4`，解析 ownershipDocument XML 拿回 transaction code/10b5-1，**直连 SEC、FMP 内部人已退役**(`data_insider` 删表，内部人唯一源)；`/jobs/pull-form4`；#104/PR#133、#132)。
- `services/alpha` —— **唯一的定价/决策 LLM agent**：事件 → 重定价 → 交易信号（读 data 预热的缓存；参考估值经 `POST {DATA_URL}/internal/valuation` 取）。
- `services/portfolio` —— **`portfolio_positions` 账本唯一 owner**，无 LLM：接收 alpha 的信号 → 记录 + 确定性 sizing 开仓 → `/jobs/track` 按止损/止盈/到期结算平仓。`services/web` 仪表盘只读这套数据。
- `services/web` —— Next.js 只读仪表盘 + **唯一对外公开入口**。也托管 **OAuth 门禁的 MCP 端点**(`app/api/mcp/route.ts` → `/api/mcp`，streamable HTTP，`mcp-handler` + `withMcpAuth`)给用户自己的 Claude(Desktop/claude.ai)连。web 经 Better Auth `mcp()` 插件充当 **OAuth 2.1 AS**(`/.well-known/*` 发现 + DCR + PKCE，#P2)。工具:公开 `get_symbol_research` / `list_13f_investors` / `get_13f_investor`(SEC/公开源)+ **私有 `get_holdings` / `get_watchlist`**(按 **token 的 user** 取，绝不信客户端入参——租户隔离红线)。**MCP 工具直读只读 DB**(复用 `@qt/shared/research`、`@qt/shared/thirteenf-read` + web 的 holdings/watchlist 读，与仪表盘同源,不回调 data)。data/alpha/portfolio 为**内部服务**。

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
- `.claude/rules/web.md` —— Next.js 只读仪表盘：读穿 `/api/*`、写 forward、图表/tab 模式（`services/web/**`）
- `.claude/rules/alpha-agent.md` —— Agent SDK、工具集、emit_signal 护栏（`services/alpha/**`）
- `.claude/rules/database.md` —— Drizzle schema / 迁移流程 / PIT / upsert 细则（`packages/shared/src/db/**` 等）

## 当前阶段

闭环已打通：data news 摄入 → 初筛+分诊+缓存预热 → alpha 重定价出信号 → portfolio sizing 开仓 + `/jobs/track` 结算平仓；`services/web` 只读仪表盘 + 人工分诊审核。进行中的工作与路线图见 **GitHub issues**（v2 总览 #48，架构讨论 #44，news 驱动 #59）。
