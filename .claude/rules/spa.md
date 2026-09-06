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
- **`/tools` 是工具中心页,真源 `lib/tools.ts` 的 `TOOLS`**。**新增一个工具必须往 `TOOLS` 加一条** —— 中心页、`TOOLS_SEO` 的 `ItemList`、footer 全从它生成。漏加 = 中心页不列它 = 没有任何内链指向它 = 爬虫发现不了这个工具(预渲染出来也没用)。`assertToolGraph()` 在预渲染时跑,路径不在 `/tools/` 下、重复、缺 name/blurb、子页面不在父路径下,都**构建失败**。
- **中心页的每个工具名本身就是 `<a>`**(`<h2><Link href></Link></h2>`),子页面是裸路径 `<a>` 列表 —— 爬虫只跟 anchor,button/onClick 一律不算。**footer 只链 `/tools`,不要再逐个链具体工具**:footer 在每个公开页上,链一个会随工具增长而失控的列表就是自找维护;中心页负责往下分发,任何页面到任何工具最多两跳。
- `entry-server.tsx` **只直接 import 公开页**,不碰 `src/routes.tsx`(那会把 auth/SWR/图表整个工作台拉进 Node)。用 `renderToStaticMarkup`,客户端仍是 `createRoot` **不做 hydration** —— 工具页的默认日期是「今天 / 十年前」,构建期与访问期不同,hydrate 必然 mismatch。
- 输出文件名必须是 **`<path>.html`,不能是 `<path>/index.html`**:CF Pages 对目录索引会先 308 到带斜杠形式,既多一跳、又让 canonical 指向一个会重定向的 URL。同理**不要**给这些路径加 `_redirects` 规则 —— Pages 会把 `.html` 用 308 剥掉,`/tools/x -> /tools/x.html 200` 直接变成重定向死循环(两者都用 `npx wrangler pages dev services/spa/dist` 实测过)。
- JSON-LD 里的 FAQ 文案必须与页面上**可见**文案逐字一致(Google 的要求),改一处要同步另一处。
- `index.html` 里的 `<!-- seo:start … seo:end -->` 区块是脚本的替换锚点,别删;它同时是 dev server 的默认 head。

## 预设回测落地页(`lib/backtest-presets.ts`)

`/tools/portfolio-backtest/<slug>`(对比页在 `/compare/<slug>`) 每条是一个独立可索引页面(`?p=` 参数页永远排不上 —— 它们全部 canonical 回裸路径,在索引里不作为页面存在)。

- **真源是 `BACKTEST_PRESETS`**,喂四个消费者:`src/routes.tsx` 的路由、`prerender/entry-server.tsx` 的 `COMPONENTS`、`lib/seo.ts` 的 `PUBLIC_PAGES`/sitemap、`components/backtest/preset-links.tsx` 的内链。加一页 = 往 `BACKTEST_PRESETS` 加一条 + 在 `presets/index.ts` 的 `PRESET_COPY` 注册文案组件。`assertPresetGraph()` 在预渲染时跑,slug 重复/`related` 悬空/FAQ 为空都会**构建失败**。
- **路径由 `presetPath(preset)` 按 `kind` 生成**:`comparison` → `/compare/<slug>`,`basket` → `/<slug>`。**slug 保持扁平、不要写斜杠** —— `assertPresetGraph` 的 slug 正则拒绝 `/`,而且路径段不是预设的身份。`presetPath` 是唯一把 slug 变成路径的地方,改 URL 形态就改这一个函数(`prerender.mjs` 一行都不用动)。
- **排版重点由数据决定,不由页面声明**:`dividendShare(result) >= DIVIDEND_LEAD_THRESHOLD`(15%)才让逐年收入/收益率成本/砍息成为主区块,否则收成一行摘要。实测分界很干净(SCHD 26% / VYM 24% vs SPY 9.7% / QQQ 3.2%),而且这样自由工具里手打 QQQ 也能得到正确排布 —— **不要退回成给预设打 `focus` 标签**。
- **基准线(SPY)**:`preset.benchmark` 默认 `"SPY"`,基准已在持仓里时自动跳过;`ChartSeries.benchmark` 让它渲染成灰色细线(对齐 `nav-chart.tsx` 的 NAV-vs-SPY 约定),且不占用调色板槽位。
- **`lib/backtest.ts` 的请求去重缓存不要拿掉**:网关限流 20 次/分钟/IP,而对比页 + 基准 = 3 次请求,连点几个预设页就会撞 429。缓存按序列化 request 做键,失败不缓存。
- **路由按 registry 逐条枚举,不要用 `:slug`**:未知子路径落到既有的 `*` catch-all(和其它坏 URL 一致),不会在无限 URL 空间上渲染软 404;而且客户端路由与预渲染用**同一个组件 + 同一个 prop**。`PresetBacktestView` 接 `preset` prop,**绝不读 `useParams()`** —— 预渲染在无 `<Routes>` 的 StaticRouter 里直接渲染组件,`useParams()` 是空的,每页都会预渲染成空白。
- **窗口用 `years` 相对值,不写死日期**;文案里**不要出现具体收益率数字**(会过期,还会和上方实时表格自相矛盾),只写不动的基金事实(指数规则、费率、持仓数量级)。
- **预设页只用 `<BacktestMethodNotes variant="brief" />`**(三张卡 + 链回工具页),不要复制主工具页那七张 —— 四个页面挂同一段文字就是自己制造的重复内容,样板占比过高正是批量页被过滤的原因。
- **内链一律裸路径**,不要从预设页用 `?p=…` 深链回工具页 —— 那等于亲手制造可被爬取的参数 URL。
- 结果渲染/取数全部走 `components/backtest/*` 与 `lib/backtest.ts` 的 `useDividendBacktest`,表单页与预设页共用,不要各写一份。

## 组件 / 构建

- **图表 lightweight-charts 经 `*.lazy.tsx`(`React.lazy` + `Suspense`)懒加载**(包大、碰 DOM);canvas 内颜色**硬编码 hex**(CSS 变量不解析)。参考 `components/{price,nav}-chart{,.lazy}.tsx`。
- **日线序列必须按数据量设置 `minBarSpacing`,否则 `fitContent()` 会被静默钳制。** 该选项默认 **0.5 像素/根**,而 `fitContent()` 压不过它:十年日线约 2,500 根,在 800px 绘图区只有 0.32px/根、手机 308px 只有 0.12px/根 —— 全部低于下限,于是最早的年份被挤出左边,且**无法缩小**拉回来(实测手机上「十年回测」只显示 2.4 年)。桌面端只丢约 3 年,看起来仍像一张正常的图,所以这个 bug 很能藏。
- 正确做法见 `backtest-chart.tsx` 的 `applyFit()`:**把下限动态设成「刚好装下全部数据」的比例**(绘图区宽 ÷ 点数,取自 `timeScale().width()`),而不是写死一个极小值 —— 写死能修好默认视图,但读者可以滚轮把整张图缩成一条细缝且没有重置按钮;设成 fit 比例则「缩到最小」恰好等于「整个窗口」。数据变化时重算并 `fitContent()`;**resize 时只重算下限、不要 `fitContent()`**(配合 `lockVisibleTimeRangeOnResize` 保住读者已有的缩放)。另配 `fixLeftEdge`/`fixRightEdge` 防止拖进空白区。
- **`price-chart.tsx` / `nav-chart.tsx` 尚未做这件事**(见 issue):前者最多 2,600 根、「10Y」按钮实际只显示约 6.3 年;后者点数无上限、每年 +252。三个图表目前是近似复制品,共享配置未抽出。
- **`@qt/shared` 只 `import type`** 或纯客户端子路径(如 `market-hours`、`valuation-model-names`)——绝不把 `db`/`config` 等服务端模块拉进浏览器 bundle。
- 复用既有原件:`components/ui.tsx`、`components/live.tsx`、`lib/format.ts`。样式 Tailwind v4(`@import "tailwindcss"`)+ `:root` token,暗色硬编码;字体 Geist 经 `@font-face`(`public/fonts/`)。
- **用户可见文案一律英文**(同原 web:JSX 文本/标签/占位符/按钮/CTA/aria-label)。代码注释英文(见 typescript.md)。

## 环境 / 部署

- `VITE_API_URL` = gateway base(dev `services/spa/.env.local` = `http://localhost:8081`;prod CF Pages 环境变量 = `https://api.<域>`)。`import.meta.env.VITE_*`,不是 `process.env`。
- CF Pages:构建命令 `pnpm install --frozen-lockfile && pnpm --filter @qt/spa build`、输出目录 `services/spa/dist`、根目录留空(pnpm workspace 要在仓库根装依赖解析 `@qt/shared`);`NODE_VERSION=20`。纯静态,不进 docker-compose。
