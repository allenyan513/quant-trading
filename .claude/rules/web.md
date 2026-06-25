---
paths:
  - "services/web/**"
---

# Web 仪表盘（Next.js App Router）约定

`services/web` 是只读监控仪表盘：Next.js App Router + React + Drizzle(neon-http)。**不是 Hono 服务**——services.md 的 Hono/端点/outbox 那套不适用这里（且它的 glob 是 `services/**/*.ts`，连 `.tsx` 都不匹配）。

## 数据流向（一条线）

页面(`"use client"`) → `useLive`/`LiveTable`（SWR 5s 轮询，`components/live.tsx`）→ `/api/*` route handler（`export const runtime="nodejs"` + `dynamic="force-dynamic"`，用 `handle()` 包 envelope，`lib/api.ts`）→ `lib/queries.ts` 里 Drizzle 读（`lib/db.ts` 的 `db()`，neon-http，**只读角色**）。Edge 中间件只做鉴权，绝不碰 DB。

## 铁律

- **web 只读 DB**：任何写都不在 web 落库（表的单一 owner 在后端服务，T12）。写操作 forward 到拥有该表的服务的 HTTP 端点：`fetch(\`${dataUrl()}/...\`)` 或 `deliverJson`。参考 `app/api/candidates/promote/route.ts`、`app/api/holdings/credentials/route.ts`。
- **服务地址静态读 `process.env.DATA_URL`，别用 `config.dataUrl()`**：后者内部是动态 `process.env[name]` 查找，Next 路由运行时读到空（Next 只内联静态访问）。在 handler 内读、缺了 per-request 抛错。
- **解析下游 envelope 的错误要取 `error.message`**：后端失败时 `error` 是对象 `{code,message}`，直接 `new Error(json.error)` 会显示 `[object Object]`。
- **Server Component 读 DB 必须 `export const dynamic="force-dynamic"`**：否则 `next build` 静态预渲染时没有 `DATABASE_URL` → 构建报 "Missing required env var: DATABASE_URL"。
- **被路由 import 的模块别在模块顶层 `requireEnv`/throw**：`next build`(collecting page data)会以 `NODE_ENV=production`、但**无运行时 env** eval 这些模块（如 `lib/auth-server.ts` 经 `/.well-known/*`、`/api/auth/*` 路由被加载）。模块级的缺-env-就-throw 会让 Cloud Run `next build` 挂。用 `const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"` 守卫：构建期返回占位值，运行时再强校验（懒连接的 Pool 用占位 URL 构造无害）。web build 脚本是裸 `next build`(不加载 `.env`)，所以本地 `pnpm --filter @qt/web build` 正好复现 Cloud 的无 env 环境、可验。
- **改/删/移动路由后先 `rm -rf services/web/.next` 再 typecheck**：`.next/types` 残留旧路由的类型引用，`tsc` 会报 TS2307（找不到已删的 page/route 模块）。
- **用户可见文案一律英文**：JSX 文本、标签/标题/占位符/按钮/徽章/CTA/aria-label，以及任何会渲染给用户的模板串，都用自然、简洁的英文（产品对外）。复用既有英文术语保持一致：Watchlist / Holdings / Positions / Valuation / Reference valuation / Earnings calendar / Economic calendar / Movers / Legends / Morning brief 等。这条只管 UI 文案；代码注释的英文要求见 `typescript.md`。新增页面/组件别再写中文文案。

## 组件 / 页面模式

- **图表用 lightweight-charts（非 Recharts），且只能经 `*.lazy.tsx`（`dynamic(import, {ssr:false})`）引入**——它访问 window/DOM，SSR / standalone 构建会崩；canvas 内颜色用硬编码 hex（CSS 变量不解析）。参考 `components/price-chart{,.lazy}.tsx`、`nav-chart{,.lazy}.tsx`。
- **多 tab 详情页**：`layout.tsx`(server, 渲染 `<PageTitle>` + 客户端 tab 条，tab 高亮用 `useSelectedLayoutSegment()`) + 各 tab 子路由 `page.tsx` + 裸路由 `page.tsx` 用 server `redirect()` 落默认 tab。参考 `app/(dashboard)/data/symbol/[symbol]/*` 与 `data/holdings/*`。
- 复用既有原件别重写：`components/ui.tsx`（`Card`/`Stat`/`Grid`/`Badge`/`statusColor`）、`components/live.tsx`（`LiveTable`/`useLive`）、`lib/format.ts`（`fmtMoney`/`fmtPct`/`fmtNum`/`fmtDate`）。`LiveTable` 的 `path` 端点必须返回**数组**；单对象快照响应自己渲染表格。`LiveTable` 还支持可选 `sort`(列内客户端排序)、`rowFilter`(客户端行过滤,如按分组 tab)、`onRowDoubleClick`、`getRowDragData`(行可拖,原生 HTML5 DnD)——要这些交互复用它,别重造表格。

## 导航与归属

- 导航单一真源 `lib/subsystems.ts`：每个页面归属**拥有其数据的子系统**（`PageTitle` 的 subsystem chip 体现）。新页面加进对应子系统的 `pages` 数组——**顺序即渲染顺序**。
- 鉴权：**Better Auth 会话**（Edge middleware 乐观校验 cookie，handler/page 内 `getSession` 全校验）。未登录:页面 → `/landing`，API → 401（`useLive` fetcher 收 401 跳 `/sign-in`）。公开放行见 `middleware.ts` 的 `isPublic`（`/landing`、`/sign-in`、`/sign-up`、`/api/auth/*`、`/.well-known/*`、`/api/mcp`）。
- **MCP 端点**（`app/api/mcp/route.ts` → `/api/mcp`）：**OAuth 门禁**(#P2)。web 经 Better Auth `mcp()` 插件充当 OAuth 2.1 AS；端点用 `mcp-handler` 的 `withMcpAuth`+`verifyToken`（→`auth.api.getMcpSession`）校验 bearer，无 token → 401 + `WWW-Authenticate`（指向 `/.well-known/oauth-protected-resource`），Claude 自走 OAuth（DCR+PKCE）。middleware 放行 `/api/mcp` + `/.well-known/*`（它们走 OAuth，别被仪表盘 session 守卫拦）。工具:公开（research + 两个 13F，单源 `lib/mcp/register-public-tools.ts`）+ **私有 `get_holdings` / `get_watchlist`，user 只取自 `extra.authInfo`（token 的 user），绝不信客户端入参**。工具直读只读 DB（复用 `@qt/shared/research`、`@qt/shared/thirteenf-read`，注入 `lib/db.ts` 的 `db()`），**不回调 data**——MCP 全只读,与"web 只读 DB"一致。
