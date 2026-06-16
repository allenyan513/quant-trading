# Quant Trading System

事件驱动的分布式量化交易系统。三个独立 HTTP 服务：

```
外部源 → data → (event) → alpha → (signal) → portfolio (sizing + 开/平仓结算)
```

技术栈：TypeScript + Hono + Neon(Postgres) + Drizzle + Anthropic SDK（Messages API）。
部署：Cloud Run / 本地 Docker Compose。

编码约束见 `.claude/rules/`；设计讨论 / 路线图 / 任务状态用 GitHub issues（v2 总览见 #48）。

## 结构

- `packages/shared` —— 领域类型 / envelope / config / db(schema+client) / fmp 客户端 / http 工具
- `services/data` —— 外部数据唯一接收者（v1 只做定时 pull），无 LLM
- `services/alpha` —— 核心 LLM agent，事件 → 交易信号
- `services/portfolio` —— `positions` 账本唯一 owner，无 LLM：记录信号 + 确定性 sizing 开仓 + 止损/止盈/到期结算平仓
- `services/web` —— 只读监控仪表盘（Next.js）+ **唯一对外公网入口**；也托管 MCP 端点 `/api/mcp`（bearer `MCP_TOKEN` 门控）向第三方 LLM 吐调研/持仓/13F 数据。data/alpha/portfolio 为内部服务。

## 本地开发

```bash
pnpm install
cp .env.example .env   # 填入 DATABASE_URL / ANTHROPIC_API_KEY / FMP_API_KEY
pnpm db:generate && pnpm db:migrate
# 一键起全部（本地 tsx 热重载）
pnpm dev             # data:8081 alpha:8082 portfolio:8084 (+ web)
# 或单服务热重载
pnpm dev:data        # :8081
# 或全栈容器
pnpm up              # host 8081/8082/8084
```

## 状态

闭环已打通（data → alpha → portfolio + web 仪表盘）。进行中的工作与路线图见 GitHub issues。
