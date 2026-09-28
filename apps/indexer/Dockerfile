# Self-hosted indexer. Build from the repository root:
#   docker build -f apps/indexer/Dockerfile .
FROM node:22-bookworm-slim

# Bun installs the workspace from the committed lockfile; Node runs envio.
RUN npm install -g bun@1.3.14
ENV HUSKY=0

WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
COPY packages/tsconfig packages/tsconfig
COPY packages/contracts/package.json packages/contracts/
COPY apps/indexer/package.json apps/indexer/
RUN bun install --frozen-lockfile --filter @matocard/indexer

COPY apps/indexer apps/indexer
WORKDIR /repo/apps/indexer
RUN ./node_modules/.bin/envio codegen

# exec form without npx, so a stop signal reaches envio instead of npm
CMD ["./node_modules/.bin/envio", "start"]
