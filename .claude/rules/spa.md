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

## 公开页设计规范(token + `PageSection`,**先看这节再写新页面**)

`src/globals.css` 的 `:root` 早就写着「颜色只在这里出现」并且守住了;**布局/间距/字号以前没有这条纪律**,于是公开面漂成了五个容器宽度(720/760/860/960/1040)、两套 gutter 起点、四种 H1 尺寸 —— 没人决定过,是一页一页攒出来的。现在它们和颜色一样是 token,并且**由 `src/design-system.test.ts` 在 `pnpm test` 里强制**。

- **整个公开面只有一个容器宽度 `--w-page: 1040px`**(首页、`/tools` 及子页、`/blog` 及子页、about/privacy/terms 全都是它)。**没有第二档可选,这是刻意的** —— 只要存在一个「选宽度」的决定,每写一个新页面就会重新拍一次脑袋,五个宽度就是这么来的。手机上它天然是满屏(`width:100%` + max-width),内容左右各留 `--page-gutter` 的下限 16px(文字贴着屏幕边缘没法读)。
- **`components/public-chrome.tsx` 是唯一写下这些的地方**:`<PublicPage>` 提供 chrome(**无 width 参数**),`<PageSection pad="page|top|body|flush|bottom">` 是居中内容列。**页面不要再手写 `width:100%; maxWidth:N; margin:"0 auto"; padding:clamp(...)`**。
- **header/footer 也收在同一列里**(不是满宽) —— 这是 logo 左边缘与 H1 对齐的原因,也是「看起来像设计过」性价比最高的一处。
- **`--w-measure`(720)不是容器**,是「一段长正文的行宽上限」,按排版需要单独套在段落上(工具页/预设页的导语)。**博客正文按站长要求跑满 1040**(约 130 字符一行,是舒适上限的两倍;想改回来就是给正文加一个 `maxWidth: "var(--w-measure)"`)。
- **字号只从 `--fs-*` 取**:`--fs-display`/`--fs-h1`/`--fs-h2{,-display}`/`--fs-h3`/`--fs-lead{,-display}`/`--fs-body`/`--fs-copy`/`--fs-meta`。`display` 档只属于营销首页,其余页面 H1 全站一个尺寸。
- **`src/design-system.test.ts` 只禁三件事**(其余自由):① `margin:"0 auto"` 与数字 `maxWidth` 同时出现(= 手写的居中容器);② `padding` 里出现字面量 `clamp(`(gutter 只有一条 ramp);③ 字面量 `clamp()` 字号。**卡住文字行宽或插图的 `maxWidth` 不禁** —— 那是单页排版决策,不是跨页漂移的来源。它还断言 `--w-*` 只有 `--w-page` 与 `--w-measure` 两个,**加第三个容器宽度会直接测试失败**。新增公开页要把文件加进 `PUBLIC_FILES` 列表(显式列表,不 glob:新公开页应当是一次有意的登记)。
- **作用域只有公开页**。工作台(`pages/workspace/**`)是密集终端式布局,规则本就不同,现在不在检查范围内;要收编它是另一轮改动。

## 公开页预渲染(SEO,`prerender/`)

`pnpm build` = `vite build` → `vite build --ssr prerender/entry-server.tsx` → `node prerender/prerender.mjs`。**公开可索引的路由必须走这条线**,否则爬虫拿到的是首页的 head(含 `canonical: /`)+ 空 `<div id="root">`,工具页会被判成首页的重复页。

- **真源 `lib/seo.ts` 的 `PUBLIC_PAGES`**(path/title/description/JSON-LD)。加一个公开页 = 往这里加一条 + 在 `prerender/entry-server.tsx` 的 `COMPONENTS` 里登记组件(没登记会**构建失败**,不会静默漏掉);sitemap.xml 由脚本从同一份列表生成。title ≤60 字符、description 140–160。
- **`/tools` 是工具中心页,真源 `lib/tools.ts` 的 `TOOLS`**。**新增一个工具必须往 `TOOLS` 加一条** —— 中心页、`TOOLS_SEO` 的 `ItemList`、footer 全从它生成。漏加 = 中心页不列它 = 没有任何内链指向它 = 爬虫发现不了这个工具(预渲染出来也没用)。`assertToolGraph()` 在预渲染时跑,路径不在 `/tools/` 下、重复、缺 name/blurb、子页面不在父路径下,都**构建失败**。
- **中心页的每个工具名本身就是 `<a>`**(`<h2><Link href></Link></h2>`),子页面是裸路径 `<a>` 列表 —— 爬虫只跟 anchor,button/onClick 一律不算。**footer 只链 `/tools`,不要再逐个链具体工具**:footer 在每个公开页上,链一个会随工具增长而失控的列表就是自找维护;中心页负责往下分发,任何页面到任何工具最多两跳。
- `entry-server.tsx` **只直接 import 公开页**,不碰 `src/routes.tsx`(那会把 auth/SWR/图表整个工作台拉进 Node)。用 `renderToStaticMarkup`,客户端仍是 `createRoot` **不做 hydration** —— 工具页的默认日期是「今天 / 十年前」,构建期与访问期不同,hydrate 必然 mismatch。
- 输出文件名必须是 **`<path>.html`,不能是 `<path>/index.html`**:CF Pages 对目录索引会先 308 到带斜杠形式,既多一跳、又让 canonical 指向一个会重定向的 URL。同理**不要**给这些路径加 `_redirects` 规则 —— Pages 会把 `.html` 用 308 剥掉,`/tools/x -> /tools/x.html 200` 直接变成重定向死循环(两者都用 `npx wrangler pages dev services/spa/dist` 实测过)。
- JSON-LD 里的 FAQ 文案必须与页面上**可见**文案逐字一致(Google 的要求),改一处要同步另一处。
- `index.html` 里的 `<!-- seo:start … seo:end -->` 区块是脚本的替换锚点,别删;它同时是 dev server 的默认 head。

## 博客(`content/blog/` + `lib/blog.ts`)

`/blog`(英文)与 `/blog/zh`(中文)两个语言版本,每版一个索引 + 一个 RSS;文章路径 `/blog/<slug>` 与 `/blog/zh/<slug>`。**文章是仓库里的 Markdown 文件**,不进 DB —— 公开面全靠构建期预渲染才可索引,DB 文章要么客户端渲染(爬虫又拿到空 `<div id="root">`,等于回到预渲染要解决的那个问题)、要么每次改文都要触发重建。**发文 = 提一个 PR**。

- **真源 `content/blog/<lang>/<slug>.md`**,经 `lib/blog.ts` 的 `import.meta.glob(..., "?raw")` 在构建期内联,喂四个消费者:`pages/blog/`(索引与文章页)、`src/routes.tsx`(逐条枚举路由)、`lib/seo.ts` 的 `PUBLIC_PAGES`/sitemap/`BLOG_FEEDS`、footer 链接。**加一篇文章只需要加一个 `.md` 文件**,其余全部派生 —— 不要再去别处登记。
- frontmatter 只认 `title` / `description` / `date` / `updated` / `tags`,写错 key 直接**构建失败**(拼错的 key = 静默丢失的元数据,比构建失败糟)。`assertBlogGraph()` 还会卡 slug 形态、日期格式、`updated < date`、正文为空、正文里的裸 HTML(渲染器不透传 HTML,写了只会显示成源码),以及**标题/描述长度按语言分档**(en 描述 80–180、zh 40–90 —— 搜索结果按渲染宽度截断,中文字符宽度和信息量都约为拉丁字符两倍,套英文字数会逼出注水句子)。
- **`assertBlogLinks()` 校验文章里所有站内链接**(`](/...)`)必须命中 `PUBLIC_PAGES` 里真实产出的路径,否则构建失败 —— 长文是死链的主要来源,文章里的 404 和中心页上的一样贵。
- **中英是两个独立可索引页面,不是客户端语言开关**:各有 canonical、各有 RSS,靠 `hreflang` 互指。`PageSeo` 的 `alternates` **必须包含自己**且双向对齐(Google 会校验对方是否指回来,单向标注直接丢弃);`lang` 同时写进 `<html lang>`(prerender 替换)与 `og:locale`。
- **英文 slug 不能叫 `zh`** —— `/blog/zh` 是中文索引本身,`assertBlogGraph()` 直接拒。`dist/blog/zh.html` 与 `dist/blog/zh/` 目录共存已用 `npx wrangler pages dev services/spa/dist` 实测:`/blog/zh` 直接 200,不走 308。
- **这是公开面唯一允许非英文文案的地方**(见 CLAUDE.md 的全英文铁律):`content/blog/zh/*` 与 `lib/seo.ts` 里 `BLOG_INDEX_COPY.zh`、`post-view.tsx` 的 `MORE_COPY.zh` 这几处 UI 串是中文版页面的正文/标签。**外围 chrome(header/footer/about/tools)一律保持英文**,不要跟着中文化。
- 文章页与索引页 `lang` / `post` **一律走 prop,绝不读 `useParams()`**(同预设页:预渲染在无 `<Routes>` 的 StaticRouter 里直接渲染组件,params 是空的,会把每篇文章渲染成空白)。
- 正文渲染用 `components/post-markdown.tsx`(阅读排版、站内链接走 `<Link>` 保持客户端跳转),**不要复用 `brief-markdown.tsx`** —— 那个是仪表盘密度、且把所有链接强制 `target="_blank"`,用在站内链接上对读者不友好。

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
