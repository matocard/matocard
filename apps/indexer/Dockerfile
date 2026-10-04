# Self-hosted indexer. Build from the repository root:
#   docker build -f apps/indexer/Dockerfile .
FROM node:22-bookworm-slim

# Bun installs the workspace from the committed lockfile; Node runs envio.
RUN npm install -g bun@1.3.14
ENV HUSKY=0

WORKDIR /repo
# The whole repo, so every workspace's manifest is there for the frozen lockfile
# and a new workspace cannot break this build again (#75). .dockerignore keeps
# node_modules, .env files and build output out.
COPY . .
RUN bun install --frozen-lockfile --filter @matocard/indexer
WORKDIR /repo/apps/indexer
RUN ./node_modules/.bin/envio codegen

# exec form without npx, so a stop signal reaches envio instead of npm
CMD ["./node_modules/.bin/envio", "start"]
