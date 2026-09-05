---
paths:
  - "services/spa/**"
---

# SPA 前端（Vite + React Router）约定

`services/spa` 是**纯前端 SPA**：Vite + React 19 + React Router v6 + SWR，部署 Cloudflare Pages。**没有任何服务端逻辑** —— 原 Next 的 `/api/*` + Better Auth + MCP 全在 `services/gateway`。services.md 的 Hono/端点/outbox 那套不适用这里(它的 glob 是 `services/**/*.ts`，连本包都几乎不碰)。

## 包布局 / 别名

- **`@/*` → 包根**(`vite.config.ts` 的 alias，对齐原 web 的 tsconfig)。`components/`、`lib/`、`pages/` 在包根；入口在 `src/`(`main.tsx`/`App.tsx`/`routes.tsx`/`globals.css`)。所有 `@/components/...`、`@/lib/...` 导入沿用,不要改成相对路径。
- 是 SPA 不是 Next：**没有** `next/*`。原 Next 接口用 shim 顶替 —— `next/link` → `@/components/link`(`<Link href>`)、`next/navigation` → `@/lib/next-navigation`(`useRouter`/`useParams`/`usePathname` + `segmentAfter` 替 `useSelectedLayoutSegment`)。新代码直接用 `react-router-dom`。

## 数据流向(一条线)

页面 → `useLive`/`LiveTable`(SWR 5s 轮询，`components/live.tsx`)或写操作 `apiSend`/`apiAction`(`lib/api-client.ts`)→ **全部经 `apiUrl()`**(`lib/api-base.ts`)→ gateway。

- **`apiUrl(path)` = `import.meta.env.VITE_API_URL + path.replace(/^\/api/, "")`**：调用点保留旧的 `/api/...` 路径不动,由它统一加 gateway base + 去 `/api` 前缀。**所有 fetch 必带 `FETCH_OPTS`(`credentials: "include"`)** —— 否则同站子域的 cookie 不随行。新增请求一律走 `apiUrl` + `FETCH_OPTS`,不要裸 `fetch("/api/...")`。
- `LiveTable` 的 `path` 端点须返回**数组**；单对象快照自己渲染。复用既有 props:`Column.sort`、`rowFilter`、`onRowDoubleClick`、`getRowDragData`。

## 鉴权(cookie 会话)

- `@/lib/auth-client.ts` = Better Auth react 客户端,`baseURL = VITE_API_URL`、`basePath: "/auth"`、`credentials: "include"`。`signIn`/`signUp`/`signOut`/`useSession` 照用。apex 与 api 是**同站子域**,cookie(`.<域>`,`SameSite=Lax`)天然随行,**不存 token 到 JS**(`bearer` 插件留给移动端)。
- 路由守卫:`workspace/layout.tsx` 用 `useSession` —— 无会话 `<Navigate to="/">`。Google social 的 `callbackURL` 必须是 **SPA 绝对地址**(`window.location.origin + …`,回调在 gateway origin 上跑;gateway `trustedOrigins` 已放行)。
- **首页 `/` 必须纯静态**:不调 `useSession`、不发任何请求(两个固定 CTA)。匿名/bot 落地不该打计费的 gateway —— 这是整个拆分的初衷,别回退成动态 CTA。

## 路由

- React Router v6 嵌套路由,真源 `src/routes.tsx`;layout 用 `<Outlet/>`(tab/工作台跨页保活靠嵌套路由)。索引重定向页 → `<Navigate to=… replace>`。导航真源 `lib/subsystems.ts`(`NAV_SECTIONS`)。
- 深链/刷新靠 `public/_redirects`(`/* /index.html 200`,Vite 自动拷进 `dist`)。

## 公开页预渲染(SEO,`prerender/`)

`pnpm build` = `vite build` → `vite build --ssr prerender/entry-server.tsx` → `node prerender/prerender.mjs`。**公开可索引的路由必须走这条线**,否则爬虫拿到的是首页的 head(含 `canonical: /`)+ 空 `<div id="root">`,工具页会被判成首页的重复页。

- **真源 `lib/seo.ts` 的 `PUBLIC_PAGES`**(path/title/description/JSON-LD)。加一个公开页 = 往这里加一条 + 在 `prerender/entry-server.tsx` 的 `COMPONENTS` 里登记组件(没登记会**构建失败**,不会静默漏掉);sitemap.xml 由脚本从同一份列表生成。title ≤60 字符、description 140–160。
- `entry-server.tsx` **只直接 import 公开页**,不碰 `src/routes.tsx`(那会把 auth/SWR/图表整个工作台拉进 Node)。用 `renderToStaticMarkup`,客户端仍是 `createRoot` **不做 hydration** —— 工具页的默认日期是「今天 / 十年前」,构建期与访问期不同,hydrate 必然 mismatch。
- 输出文件名必须是 **`<path>.html`,不能是 `<path>/index.html`**:CF Pages 对目录索引会先 308 到带斜杠形式,既多一跳、又让 canonical 指向一个会重定向的 URL。同理**不要**给这些路径加 `_redirects` 规则 —— Pages 会把 `.html` 用 308 剥掉,`/tools/x -> /tools/x.html 200` 直接变成重定向死循环(两者都用 `npx wrangler pages dev services/spa/dist` 实测过)。
- JSON-LD 里的 FAQ 文案必须与页面上**可见**文案逐字一致(Google 的要求),改一处要同步另一处。
- `index.html` 里的 `<!-- seo:start … seo:end -->` 区块是脚本的替换锚点,别删;它同时是 dev server 的默认 head。

## 组件 / 构建

- **图表 lightweight-charts 经 `*.lazy.tsx`(`React.lazy` + `Suspense`)懒加载**(包大、碰 DOM);canvas 内颜色**硬编码 hex**(CSS 变量不解析)。参考 `components/{price,nav}-chart{,.lazy}.tsx`。
- **`@qt/shared` 只 `import type`** 或纯客户端子路径(如 `market-hours`、`valuation-model-names`)——绝不把 `db`/`config` 等服务端模块拉进浏览器 bundle。
- 复用既有原件:`components/ui.tsx`、`components/live.tsx`、`lib/format.ts`。样式 Tailwind v4(`@import "tailwindcss"`)+ `:root` token,暗色硬编码;字体 Geist 经 `@font-face`(`public/fonts/`)。
- **用户可见文案一律英文**(同原 web:JSX 文本/标签/占位符/按钮/CTA/aria-label)。代码注释英文(见 typescript.md)。

## 环境 / 部署

- `VITE_API_URL` = gateway base(dev `services/spa/.env.local` = `http://localhost:8081`;prod CF Pages 环境变量 = `https://api.<域>`)。`import.meta.env.VITE_*`,不是 `process.env`。
- CF Pages:构建命令 `pnpm install --frozen-lockfile && pnpm --filter @qt/spa build`、输出目录 `services/spa/dist`、根目录留空(pnpm workspace 要在仓库根装依赖解析 `@qt/shared`);`NODE_VERSION=20`。纯静态,不进 docker-compose。
