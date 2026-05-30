# Build from repo root: docker build -f services/evaluation/Dockerfile .
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/evaluation/package.json services/evaluation/package.json
RUN pnpm install --frozen-lockfile=false

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/evaluation services/evaluation

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@qt/evaluation", "exec", "tsx", "src/index.ts"]
