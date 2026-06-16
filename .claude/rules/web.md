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
- **改/删/移动路由后先 `rm -rf services/web/.next` 再 typecheck**：`.next/types` 残留旧路由的类型引用，`tsc` 会报 TS2307（找不到已删的 page/route 模块）。

## 组件 / 页面模式

- **图表用 lightweight-charts（非 Recharts），且只能经 `*.lazy.tsx`（`dynamic(import, {ssr:false})`）引入**——它访问 window/DOM，SSR / standalone 构建会崩；canvas 内颜色用硬编码 hex（CSS 变量不解析）。参考 `components/price-chart{,.lazy}.tsx`、`nav-chart{,.lazy}.tsx`。
- **多 tab 详情页**：`layout.tsx`(server, 渲染 `<PageTitle>` + 客户端 tab 条，tab 高亮用 `useSelectedLayoutSegment()`) + 各 tab 子路由 `page.tsx` + 裸路由 `page.tsx` 用 server `redirect()` 落默认 tab。参考 `app/(dashboard)/data/symbol/[symbol]/*` 与 `data/holdings/*`。
- 复用既有原件别重写：`components/ui.tsx`（`Card`/`Stat`/`Grid`/`Badge`/`statusColor`）、`components/live.tsx`（`LiveTable`/`useLive`）、`lib/format.ts`（`fmtMoney`/`fmtPct`/`fmtNum`/`fmtDate`）。`LiveTable` 的 `path` 端点必须返回**数组**；单对象快照响应自己渲染表格。

## 导航与归属

- 导航单一真源 `lib/subsystems.ts`：每个页面归属**拥有其数据的子系统**（`PageTitle` 的 subsystem chip 体现）。新页面加进对应子系统的 `pages` 数组——**顺序即渲染顺序**。
- 鉴权：单密码 cookie（`DASHBOARD_PASSWORD`，本地 `123456`），`middleware.ts` 守卫除 `/login`/`/api/login`/`/api/mcp` 外的全部路由；`useLive` 的 fetcher 收到 401 自动跳 `/login`。
- **MCP 端点**（`app/api/[transport]/route.ts` → `/api/mcp`）：web 是唯一公网入口,也对第三方 LLM 托管 MCP（`mcp-handler`，streamable HTTP）。它**不走 cookie**、自己用 bearer `process.env.MCP_TOKEN` 门控（**fail-closed**：不设=503），故 middleware 放行；工具直读只读 DB（复用 `@qt/shared/research`、`@qt/shared/thirteenf-read`，注入 `lib/db.ts` 的 `db()`），**不回调 data**——MCP 全只读,与"web 只读 DB"一致。
