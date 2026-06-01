---
paths:
  - "**/*.ts"
---

# TypeScript / ESM 规范

本仓 `tsconfig.base.json`：`module`/`moduleResolution` = **NodeNext**，`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` 全开。

## 导入

- 相对导入**必须带 `.js` 后缀**，即使文件是 `.ts`：`import { runEvent } from "./pipeline.js"`。漏后缀运行时会报 `ERR_MODULE_NOT_FOUND`。
- 跨包用 workspace 别名 `@qt/shared`（及其子路径 `@qt/shared/db` 等，见 `packages/shared/package.json` 的 `exports`）。不要用相对路径穿透到别的包。
- 共享能力从 `@qt/shared` 统一出口导入（`ok`/`fail`/`config`/`db`/`dbSchema`/`deliverJson`/`fmpGet` …），不要深引 `packages/shared/src/...`。

## 类型与安全

- `noUncheckedIndexedAccess` 开启：数组/记录下标访问得到 `T | undefined`，访问后要判空，别强行 `!`。
- 外部输入（HTTP body、FMP 响应）先按 `unknown` 处理再窄化，不要直接断言成业务类型。
- 错误统一 `err instanceof Error ? err.message : String(err)`，已是全仓惯例。

## 风格

- 文件顶部用块注释说明该模块的职责（看现有文件的开头注释风格，保持一致）。
- 注释用英文，与现有代码一致；面向人的设计说明/讨论放 **GitHub issues**（不再用 `docs/`，它易过期）。
- 提交前 `pnpm typecheck` 必须过。
