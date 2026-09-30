#!/usr/bin/env bash
# Compares the hosted indexer's progress with the chain head. Behind by more
# than MAX_LAG blocks, or unreachable: opens one issue (or leaves the open one
# alone) and exits 1. Caught up: closes that issue if it is open.
#
# The Envio Cloud deployment has stopped following the chain twice with nothing
# in its logs and a status of 100%, which is why this exists.
#
# Env: GH_TOKEN (issues: write), MAX_LAG (default 1500 blocks, about ten minutes
# on Monad), RPC (default the public Monad testnet endpoint), DRY_RUN=1 to only
# print. The endpoint comes from apps/indexer/.env.example, its one source.
set -euo pipefail
cd "$(dirname "$0")/.."

MAX_LAG=${MAX_LAG:-1500}
RPC=${RPC:-https://testnet-rpc.monad.xyz}
TITLE="Indexer is behind the chain"
url=$(grep '^INDEXER_URL=' .env.example | cut -d= -f2-)

head_hex=$(curl -sf -m 20 -X POST "$RPC" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | jq -r .result)
head=$((head_hex))
progress=$(curl -sf -m 20 -X POST "$url" -H 'content-type: application/json' \
  -d '{"query":"{ _meta { progressBlock } }"}' | jq -r '.data._meta[0].progressBlock // -1' || echo -1)
lag=$((head - progress))
echo "indexer $url at $progress, chain at $head, behind by $lag (limit $MAX_LAG)"

if [ "${DRY_RUN:-0}" = 1 ]; then
  [ "$progress" -ge 0 ] && [ "$lag" -le "$MAX_LAG" ]
  exit
fi

open=$(gh issue list --state open --search "\"$TITLE\" in:title" --json number -q '.[0].number // empty')

if [ "$progress" -lt 0 ] || [ "$lag" -gt "$MAX_LAG" ]; then
  if [ -z "$open" ]; then
    gh issue create --title "$TITLE" --label indexer --body "The hosted indexer is ${lag} blocks behind the chain head (at ${progress}, head ${head}), or not answering. Limit: ${MAX_LAG} blocks.

Endpoint: ${url}

What has worked before (apps/indexer/README.md): check \`_meta { progressBlock isReady }\`, push \`main\` to \`envio\` or redeploy the commit for a fresh deployment, promote it, update the endpoint. The self-hosted stack in \`apps/indexer/docker-compose.yml\` is the fallback.

This issue closes itself when the indexer is back within the limit."
  fi
  exit 1
fi

if [ -n "$open" ]; then
  gh issue close "$open" --comment "Caught up: at ${progress}, head ${head}, ${lag} blocks behind."
fi
