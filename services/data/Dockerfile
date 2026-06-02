# Build from repo root: docker build -f services/data/Dockerfile .
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# Install deps (workspace-aware)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/data/package.json services/data/package.json
RUN pnpm install --frozen-lockfile=false

# Source
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/data services/data

ENV NODE_ENV=production
EXPOSE 8080
# Run TS directly via tsx (simple v1; switch to tsc build later)
CMD ["pnpm", "--filter", "@qt/data", "exec", "tsx", "src/index.ts"]
