# Build from repo root: docker build -f services/analysis/Dockerfile .
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/analysis/package.json services/analysis/package.json
RUN pnpm install --frozen-lockfile=false

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/analysis services/analysis

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@qt/analysis", "exec", "tsx", "src/index.ts"]
