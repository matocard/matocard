# Build from the repository root:
#   docker build -f apps/backend/Dockerfile .
FROM oven/bun:1.3.14-slim
ENV HUSKY=0 NODE_ENV=production

WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
# every workspace's manifest, or the frozen lockfile refuses to install
COPY packages/tsconfig packages/tsconfig
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY apps/indexer/package.json apps/indexer/
COPY apps/backend/package.json apps/backend/
RUN bun install --frozen-lockfile --production --filter @matocard/backend

COPY packages/core packages/core
COPY packages/contracts packages/contracts
COPY apps/backend apps/backend
WORKDIR /repo/apps/backend
USER bun
CMD ["bun", "src/index.ts"]
