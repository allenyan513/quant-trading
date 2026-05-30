---
paths:
  - "services/**/*.ts"
---

# 服务（Hono）约定

三个服务结构同构：`src/index.ts` 建 `Hono` app、挂端点、`serve({ fetch: app.fetch, port: config.port })`。改一个服务时参考另外两个的现有写法保持一致。

## 端点

- 每个服务都有 `GET /healthz` → `c.json(ok({ service, status: "up" }))`。
- 响应一律走 envelope：成功 `c.json(ok(data))`；失败 `c.json(fail(code, message), httpStatus)`。**不要**返回裸对象。
- 解析 body：`await c.req.json()`，用 `.catch(() => ({}))` 或 try/catch 兜住非法 JSON，返回 `fail("bad_request", ...)` 400。
- 端点内 `try/catch` 包住业务逻辑，异常转成 `fail(...)` + 5xx，错误码用 snake_case（如 `pull_earnings_failed`）。

## 配置与端口

- 只通过 `config.xxx()` 读 env；缺必填项让它在调用处抛（fail-fast）。不要在模块顶层读 `process.env`。
- 端口来自 `config.port`（默认 8080）；本地 dev 由 package.json 的 `PORT=808x` 指定，docker 由 compose 注入。不要在代码里硬编码端口。

## 服务间投递（outbox / at-least-once）

- 调下游用 `deliverJson(url, body, { timeoutMs, idempotencyKey })`（`@qt/shared`），URL 取自 `config.analysisUrl()` / `config.evaluationUrl()`。
- 模式：**同一事务**里写业务数据 + outbox 行（`status: "pending"`）→ 提交 → 投递；成功标 `delivered`，失败留 `pending` 等 `POST /internal/redeliver`（cron 触发）重投。
- 消费端必须**幂等**：按 `(source, external_id)`（或对应唯一键）去重，重复投递不得产生重复结果。
- 新增需要被可靠传递的跨服务消息时，沿用这个 outbox 模式，不要直接 fire-and-forget。

## 日志

- 每个服务有 `src/log.ts` 导出 `log = createLogger("<service>")`（`@qt/shared` 的结构化 logger）。**不要直接 `console.log`**。
- `event` 名用点分 `<area>.<step>[.<outcome>]`（如 `pipeline.signal`、`deliver.event.ok`），字段放第二个参数：`log.info("event.received", { external_id, symbol, type })`。
- **带上可追踪键**：事件链路用 `external_id`，信号链路用 `signal`（= signal id），这样能 grep 一条记录跨三个服务端到端追踪。
- 级别：主流程 `info`；soft-fail / outbox 留 `pending` 用 `warn`；抛错用 `error`；逐 tool/payload 等啰嗦细节用 `debug`（`LOG_LEVEL=debug` 才显示）。`LOG_FORMAT=json` 输出机器可解析行。

## 边界

- ingestion 无 LLM，只做确定性拉取/落库/投递。
- 真正的 agent 逻辑只在 analysis（见 `.claude/rules/analysis-agent.md`）。
- evaluation 的结算是确定性的，只有 critique 用 LLM。
