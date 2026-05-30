# Quant Trading System

事件驱动的分布式量化交易系统。三个独立 HTTP 服务组成闭环：

```
外部源 → ingestion → (event) → analysis → (signal) → evaluation → (feedback) ↺
```

技术栈：TypeScript + Hono + Neon(Postgres) + Drizzle + Anthropic Agent SDK。
部署：Cloud Run / 本地 Docker Compose。

设计文档见 [docs/architecture.md](docs/architecture.md)。

## 结构

- `packages/shared` —— 领域类型 / envelope / config / db(schema+client) / fmp 客户端 / http 工具
- `services/ingestion` —— 外部数据唯一接收者（v1 只做定时 pull）
- `services/analysis` —— 核心 LLM agent，事件 → 交易信号
- `services/evaluation` —— 信号结算 + LLM 复盘 + 反馈库

## 本地开发

```bash
pnpm install
cp .env.example .env   # 填入 DATABASE_URL / ANTHROPIC_API_KEY / FMP_API_KEY
pnpm db:generate && pnpm db:migrate
# 一键起全部（本地 tsx 热重载）
pnpm dev             # ingestion:8081 analysis:8082 evaluation:8083
# 或单服务热重载
pnpm dev:ingestion   # :8081
# 或全栈容器
pnpm up              # ingestion:8081 analysis:8082 evaluation:8083
```

## 状态

详见 [docs/architecture.md](docs/architecture.md) §10 分阶段交付。当前：M0 骨架。
